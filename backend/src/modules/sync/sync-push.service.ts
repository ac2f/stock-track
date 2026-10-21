import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtConfig } from '../../config/configuration';
import { ShopContext } from '../../common/shop/shop-context';
import { SyncReplica } from './entities/sync-replica.entity';
import {
  decodeHeaderJson,
  encodeHeaderJson,
  REPLAY_HEADER,
  REPLAY_META_HEADER,
  REPLAY_RESULT_HEADER,
  replaySecret,
} from './sync-replay.secret';
import type { ReplayMeta } from './sync-request';
import { SyncReplicasService } from './sync-replicas.service';

/** Replikanın gönderdiği tek işlem (giden kutusundaki satır). */
export interface PushOp {
  opId: string;
  actor: 'user' | 'corel';
  userId?: string | null;
  shopId: string;
  method: string;
  /** API ön eki olmadan: `/v1/sales`. */
  path: string;
  body?: unknown;
  occurredAt: string;
  clientIds?: { table: string; id: string }[];
  docNos?: Record<string, string>;
}

export type PushOutcome =
  | 'applied' // merkezde uygulandı
  | 'duplicate' // daha önce uygulanmıştı (aynı işlem kimliği) — ilk yanıt döner
  | 'rejected' // merkez reddetti: kişi karar vermeli (stok yetmedi, yetki yok ...)
  | 'retry' // geçici sorun (merkez meşgul/hata): sonra yeniden gönder
  | 'skipped'; // önceki işlem "retry" olduğu için denenmedi (sıra korunur)

export interface PushResult {
  opId: string;
  outcome: PushOutcome;
  httpStatus?: number;
  /** Merkezin yanıt gövdesi (`data`). */
  body?: unknown;
  error?: string;
  /** Merkezde açılan kayıtlar ve belge numaraları (yereldekiyle karşılaştırmak için). */
  created?: { inserted: { table: string; id: string }[]; docNos: Record<string, string> };
}

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Yeniden oynatılamayan yollar: oturum, ekip/dükkân/kullanıcı yönetimi, yedek, eşitleme, sistem. */
const DENIED_PATH = /^\/v1\/(sync|auth|users|shops|backups|system)(\/|\?|$)/;
/** İç istek başlığı için üst sınır (Node varsayılanı 16 KB). */
const META_MAX = 8 * 1024;

/**
 * Replikadan gelen işlemleri merkezde uygular (docs/SYNC.md § Gönderme).
 *
 * Her işlem, uygulamanın kendi ucuna iç istek olarak gönderilir — işlemi
 * yapan kişi adına kısa ömürlü bir oturumla, işlem kimliği `Idempotency-Key`
 * olarak. Böylece:
 *  - doğrulama, dükkân izni ve iş kuralları (stok, cari ...) aynen uygulanır;
 *    yetkisi alınmış bir kişinin çevrimdışı işlemi de reddedilir,
 *  - aynı işlem iki kez gelirse ikinci kez uygulanmaz (ilk yanıt döner),
 *  - kayıtlar replikadaki kimlik/numara ve asıl zamanla açılır.
 *
 * Sıra korunur: geçici bir hata ("retry") olursa sonraki işlemler denenmez.
 * Reddedilen işlemden sonra devam edilir (ona bağlı işlemler de reddedilir).
 */
@Injectable()
export class SyncPushService {
  private readonly logger = new Logger(SyncPushService.name);
  private readonly secret: string;
  private readonly jwt: JwtConfig;
  private readonly baseUrl: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly replicas: SyncReplicasService,
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.jwt = config.get<JwtConfig>('jwt')!;
    this.secret = replaySecret(this.jwt.accessSecret);
    const port = config.get<number>('app.port') ?? 3000;
    const prefix = (config.get<string>('app.globalPrefix') ?? 'api').replace(/^\/+|\/+$/g, '');
    this.baseUrl = process.env.SYNC_REPLAY_BASE_URL || `http://127.0.0.1:${port}/${prefix}`;
  }

  async push(replica: SyncReplica, ops: PushOp[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    let blocked = false;
    for (const op of ops) {
      if (blocked) {
        results.push({ opId: String(op?.opId ?? ''), outcome: 'skipped' });
        continue;
      }
      const result = await this.apply(replica, op);
      results.push(result);
      if (result.outcome === 'retry') blocked = true;
    }
    const applied = results.filter((r) => r.outcome === 'applied' || r.outcome === 'duplicate').length;
    const rejected = results.filter((r) => r.outcome === 'rejected').length;
    await this.replicas.touch(replica.id, { lastPushAt: new Date(), pushed: applied, rejected });
    if (rejected) this.logger.warn(`"${replica.name}": ${rejected} işlem reddedildi.`);
    return results;
  }

  /** Tek işlemin ön denetimi ve uygulanması. */
  private async apply(replica: SyncReplica, op: PushOp): Promise<PushResult> {
    const opId = String(op?.opId ?? '');
    const reject = (error: string, httpStatus = 400): PushResult => ({ opId, outcome: 'rejected', httpStatus, error });
    if (!KEY_RE.test(opId)) return reject('Geçersiz işlem kimliği (opId).');
    const method = String(op.method ?? '').toUpperCase();
    if (!METHODS.has(method)) return reject(`Desteklenmeyen yöntem: ${method}`);
    const path = String(op.path ?? '');
    if (!path.startsWith('/v1/') || path.includes('..') || DENIED_PATH.test(path)) {
      return reject(`Bu işlem yerel sunucudan aktarılamaz: ${method} ${path}`);
    }
    if (!ShopContext.isUuid(op.shopId)) return reject('Dükkân kimliği eksik.');
    if (replica.shopIds?.length && !replica.shopIds.includes(op.shopId)) {
      return reject('Bu yerel sunucu bu dükkân için yetkili değil.', 403);
    }
    const occurredAt = new Date(op.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) return reject('İşlem zamanı (occurredAt) geçersiz.');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': opId,
      'X-Shop-Id': op.shopId,
      [REPLAY_HEADER]: this.secret,
      [REPLAY_META_HEADER]: this.meta({
        replicaId: replica.id,
        actor: op.actor === 'corel' ? 'corel' : 'user',
        occurredAt: occurredAt.toISOString(),
        clientIds: op.clientIds ?? [],
        docNos: op.docNos ?? {},
      }),
    };

    if (op.actor !== 'corel') {
      if (!ShopContext.isUuid(op.userId)) return reject('İşlemi yapan kişi (userId) eksik.');
      const users: { id: string; email: string; role: string; full_name: string; is_active: boolean }[] =
        await this.dataSource.query(
          `SELECT id, email, role, full_name, is_active FROM users WHERE id = $1 AND deleted_at IS NULL`,
          [op.userId],
        );
      const user = users[0];
      if (!user || !user.is_active) {
        return reject('İşlemi yapan kullanıcı merkezde yok ya da pasif.', 401);
      }
      const token = await this.jwtService.signAsync(
        { sub: user.id, email: user.email, role: user.role, fullName: user.full_name },
        { secret: this.jwt.accessSecret, expiresIn: '5m' },
      );
      headers.Authorization = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: method === 'DELETE' && op.body == null ? undefined : JSON.stringify(op.body ?? {}),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      return { opId, outcome: 'retry', error: `Merkez iç isteği başarısız: ${(err as Error).message}` };
    }

    const text = await res.text();
    let parsed: { data?: unknown; message?: unknown } | null = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const created = decodeHeaderJson<PushResult['created']>(res.headers.get(REPLAY_RESULT_HEADER) ?? undefined);
    if (res.ok) {
      return {
        opId,
        outcome: res.headers.get('idempotent-replay') === 'true' ? 'duplicate' : 'applied',
        httpStatus: res.status,
        body: parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed,
        created,
      };
    }
    const message = Array.isArray(parsed?.message)
      ? parsed!.message.join(' · ')
      : typeof parsed?.message === 'string'
        ? parsed.message
        : text.slice(0, 300) || res.statusText;
    // Geçici: merkez hatası, zaman aşımı, sınır, aynı işlem şu an işleniyor.
    const busy = res.status === 409 && /şu anda işleniyor/i.test(message);
    if (res.status >= 500 || res.status === 408 || res.status === 429 || busy) {
      return { opId, outcome: 'retry', httpStatus: res.status, error: message };
    }
    return { opId, outcome: 'rejected', httpStatus: res.status, error: message };
  }

  /**
   * İç isteğin üst bilgisi; sığmazsa kimlik listesi kısaltılır (önce her
   * tablonun ilk kaydı — asıl kayıtlar — korunur).
   */
  private meta(meta: ReplayMeta): string {
    let encoded = encodeHeaderJson(meta);
    if (encoded.length <= META_MAX) return encoded;
    const ids = meta.clientIds ?? [];
    const firsts = ids.filter((x, i) => ids.findIndex((y) => y.table === x.table) === i);
    const rest = ids.filter((x) => !firsts.includes(x));
    const kept = [...firsts];
    for (const x of rest) {
      const next = encodeHeaderJson({ ...meta, clientIds: [...kept, x] });
      if (next.length > META_MAX) break;
      kept.push(x);
    }
    encoded = encodeHeaderJson({ ...meta, clientIds: kept });
    return encoded.length <= META_MAX ? encoded : encodeHeaderJson({ ...meta, clientIds: firsts.slice(0, 20) });
  }
}

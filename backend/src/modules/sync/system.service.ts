import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { ShopAccessService, ShopActor } from '../shops/shop-access.service';
import { SyncFeedService } from './sync-feed.service';

function packageVersion(): string {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Ajan bu kadar süre nabız göndermezse "çalışmıyor" sayılır. */
const AGENT_STALE_MS = 2 * 60 * 1000;

/**
 * Sunucunun kim olduğu ve (yerel sunucuda) eşitleme durumu. Arayüz üst
 * şeritte "yerel sunucu · merkez bağlantısı · bekleyen işlem" gösterir,
 * reddedilen işlemleri listeler ve yeniden denetir / vazgeçtirir.
 */
@Injectable()
export class SystemService {
  private readonly role: 'primary' | 'replica';
  private readonly version = packageVersion();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly feed: SyncFeedService,
    private readonly access: ShopAccessService,
    config: ConfigService,
  ) {
    this.role = config.get<'primary' | 'replica'>('sync.role') ?? 'primary';
  }

  async info() {
    const [{ n }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM shops WHERE deleted_at IS NULL`,
    );
    return {
      role: this.role,
      version: this.version,
      schemaHash: this.feed.schema().hash,
      // Yerel sunucu merkezden ilk yüklemeyi almadan giriş yapılamaz.
      ready: n > 0,
      serverTime: new Date().toISOString(),
    };
  }

  async status() {
    if (this.role !== 'replica') return { role: this.role };
    const [stateRows, counts] = await Promise.all([
      this.dataSource.query(`SELECT * FROM replica_state WHERE id = 1`),
      this.dataSource.query(
        `SELECT state, COUNT(*)::int AS n FROM replica_outbox
          WHERE state <> 'applied' OR updated_at > now() - interval '1 day'
          GROUP BY state`,
      ),
    ]);
    const state = stateRows[0] ?? null;
    const byState: Record<string, number> = {};
    for (const c of counts as { state: string; n: number }[]) byState[c.state] = c.n;
    const heartbeat = state?.agent_heartbeat_at ? new Date(state.agent_heartbeat_at).getTime() : 0;
    return {
      role: this.role,
      agentRunning: heartbeat > 0 && Date.now() - heartbeat < AGENT_STALE_MS,
      upstreamReachable: !!state?.upstream_reachable,
      upstreamUrl: state?.upstream_url ?? null,
      lastContactAt: state?.last_contact_at ?? null,
      lastPullAt: state?.last_pull_at ?? null,
      lastPushAt: state?.last_push_at ?? null,
      snapshotAt: state?.snapshot_at ?? null,
      lastError: state?.last_error ?? null,
      outbox: {
        pending: (byState.pending ?? 0) + (byState.pushing ?? 0) + (byState.executing ?? 0),
        rejected: byState.rejected ?? 0,
        uncertain: byState.uncertain ?? 0,
        appliedToday: byState.applied ?? 0,
      },
    };
  }

  /** Giden kutusu; varsayılan: kişinin karar vermesi gerekenler (reddedilen + belirsiz). */
  async outbox(actor: ShopActor, query: { state?: string; page: number; limit: number }) {
    this.requireReplica();
    const shops = await this.visibleShops(actor);
    const states =
      !query.state || query.state === 'open' ? ['rejected', 'uncertain'] : [query.state];
    const params: unknown[] = [states, query.limit, (query.page - 1) * query.limit];
    let shopCond = '';
    if (shops) {
      params.push(shops);
      shopCond = `AND (o.shop_id IS NULL OR o.shop_id = ANY($4::uuid[]))`;
    }
    const [rows, [{ total }]] = await Promise.all([
      this.dataSource.query(
        `SELECT o.id, o.seq::text AS seq, o.state, o.actor, o.method, o.path, o.body, o.occurred_at,
                o.attempts, o.upstream_status, o.error, o.shop_id, s.name AS shop_name,
                o.user_id, u.full_name AS user_name, o.created_at, o.updated_at
           FROM replica_outbox o
           LEFT JOIN shops s ON s.id = o.shop_id
           LEFT JOIN users u ON u.id = o.user_id
          WHERE o.state = ANY($1) ${shopCond}
          ORDER BY o.seq DESC LIMIT $2 OFFSET $3`,
        params,
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS total FROM replica_outbox o WHERE o.state = ANY($1) ${shopCond.replace('$4', '$2')}`,
        shops ? [states, shops] : [states],
      ),
    ]);
    return {
      items: rows,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        pageCount: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  /** Reddedilen/belirsiz işlemi yeniden gönderilecek yapar. */
  retry(actor: ShopActor, id: string) {
    return this.resolve(actor, id, 'pending');
  }

  /** İşlemden vazgeçer: merkeze gönderilmez, yerel etkisi ajan tarafından geri alınır. */
  discard(actor: ShopActor, id: string) {
    return this.resolve(actor, id, 'discarded');
  }

  private async resolve(actor: ShopActor, id: string, next: 'pending' | 'discarded') {
    this.requireReplica();
    const rows: { id: string; state: string; shop_id: string | null }[] = await this.dataSource.query(
      `SELECT id, state, shop_id FROM replica_outbox WHERE id = $1`,
      [id],
    );
    const op = rows[0];
    if (!op) throw new NotFoundException('İşlem bulunamadı.');
    if (op.state !== 'rejected' && op.state !== 'uncertain') {
      throw new BadRequestException('Yalnız reddedilen ya da belirsiz işlemler için karar verilebilir.');
    }
    await this.requireAdmin(actor, op.shop_id);
    await this.dataSource.query(
      `UPDATE replica_outbox
          SET state = $2::varchar, attempts = CASE WHEN $2::varchar = 'pending' THEN 0 ELSE attempts END,
              resolved_by_id = $3, resolved_at = now(), updated_at = now()
        WHERE id = $1`,
      [id, next, actor.id],
    );
    return { id, state: next };
  }

  private requireReplica(): void {
    if (this.role !== 'replica') throw new NotFoundException('Bu sunucu merkez sunucu; giden kutusu yok.');
  }

  /** Sistem sahibi ya da işlemin dükkânının yöneticisi. */
  private async requireAdmin(actor: ShopActor, shopId: string | null): Promise<void> {
    if (ShopAccessService.isOwner(actor)) return;
    if (shopId) {
      const info = await this.access.resolve(actor, shopId).catch(() => null);
      if (info?.isAdmin) return;
    }
    throw new ForbiddenException('Bu kararı sistem sahibi ya da dükkân yöneticisi verebilir.');
  }

  /** Kişinin görebildiği dükkânlar (sistem sahibi: hepsi → null). */
  private async visibleShops(actor: ShopActor): Promise<string[] | null> {
    if (ShopAccessService.isOwner(actor)) return null;
    return (await this.access.listFor(actor)).map((s) => s.id);
  }
}

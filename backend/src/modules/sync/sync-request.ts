import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { ShopContext } from '../../common/shop/shop-context';
import { ShopAccessGuard } from '../shops/shop-access.guard';
import { PRIMARY_ONLY_KEY, SYNC_JOURNAL_KEY, SYNC_SKIP_KEY } from './sync.decorators';
import { decodeHeaderJson, isReplaySecret, REPLAY_HEADER, REPLAY_META_HEADER } from './sync-replay.secret';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** İç yeniden oynatma isteğinin üst bilgisi (`X-Sync-Meta`, base64url JSON). */
export interface ReplayMeta {
  replicaId: string;
  actor: 'user' | 'corel';
  occurredAt?: string;
  clientIds?: { table: string; id: string }[];
  docNos?: Record<string, string>;
}

/**
 * Merkezde iç yeniden oynatma isteğini tanır (gizli başlık doğruysa) ve
 * isteğin bağlamına yazar: kimlikler, belge numaraları, asıl zaman.
 * shopContextMiddleware'den SONRA çalışır.
 */
export function syncReplayMiddleware(secret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers[REPLAY_HEADER];
    const candidate = Array.isArray(header) ? header[0] : header;
    if (candidate && isReplaySecret(candidate, secret)) {
      const raw = req.headers[REPLAY_META_HEADER];
      const meta = decodeHeaderJson<ReplayMeta>(Array.isArray(raw) ? raw[0] : raw);
      const store = ShopContext.current();
      if (meta && store) {
        const clientIds: Record<string, string[]> = {};
        for (const { table, id } of meta.clientIds ?? []) {
          if (typeof table !== 'string' || !ShopContext.isUuid(id)) continue;
          (clientIds[table] ??= []).push(id);
        }
        const at = meta.occurredAt ? new Date(meta.occurredAt) : undefined;
        store.sync = {
          replay: {
            replicaId: String(meta.replicaId ?? ''),
            actor: meta.actor === 'corel' ? 'corel' : 'user',
            occurredAt: at && !Number.isNaN(at.getTime()) ? at : undefined,
            clientIds,
            docNos: meta.docNos && typeof meta.docNos === 'object' ? meta.docNos : {},
          },
          capture: { inserted: [], docNos: {} },
        };
      }
    }
    next();
  };
}

export interface SyncRouteInfo {
  write: boolean;
  skip: boolean;
  journal: boolean;
  primaryOnly: boolean;
  /** Dükkân alanına yazan bir uç mu (giden kutusuna yazılır). */
  shopWrite: boolean;
  /** Dükkân/izin tanımı olmayan (oturum, ekip, kullanıcı, yedek ...) yazma ucu. */
  noShopWrite: boolean;
}

/** Bir rotanın eşitlemedeki yeri (yalnız-merkez mi, giden kutusuna mı). */
export function syncRouteInfo(reflector: Reflector, context: ExecutionContext, method: string): SyncRouteInfo {
  const targets = [context.getHandler(), context.getClass()];
  const write = WRITE_METHODS.has(method);
  const skip = !!reflector.getAllAndOverride<boolean>(SYNC_SKIP_KEY, targets);
  const journal = !!reflector.getAllAndOverride<boolean>(SYNC_JOURNAL_KEY, targets);
  const primaryOnly = !!reflector.getAllAndOverride<boolean>(PRIMARY_ONLY_KEY, targets);
  let required: ReturnType<typeof ShopAccessGuard.required> | undefined;
  try {
    required = ShopAccessGuard.required(reflector, context, method);
  } catch {
    required = undefined; // yetki tanımı yok → guard zaten reddeder
  }
  const shopWrite = write && !!required && (required.level === 'write' || !required.module);
  return {
    write,
    skip,
    journal,
    primaryOnly,
    shopWrite,
    noShopWrite: write && required === null,
  };
}

/** Yerel sunucuda bu istek giden kutusuna yazılır mı? */
export function shouldJournal(info: SyncRouteInfo): boolean {
  if (!info.write || info.skip || info.primaryOnly) return false;
  return info.journal || info.shopWrite;
}

/** Yerel sunucuda bu istek reddedilir mi (yalnız merkezde yapılır)? */
export function rejectOnReplica(info: SyncRouteInfo): boolean {
  if (info.primaryOnly) return true;
  if (!info.write || info.skip || info.journal) return false;
  return info.noShopWrite;
}

import { ShopContext } from '../../common/shop/shop-context';
import { safePrefix } from './sync-feed.service';
import { SyncPushService } from './sync-push.service';
import { decodeHeaderJson, encodeHeaderJson, isReplaySecret, replaySecret } from './sync-replay.secret';
import { rejectOnReplica, shouldJournal, SyncRouteInfo } from './sync-request';

const at = (msAgo: number, now: number) => new Date(now - msAgo);

describe('Eşitleme', () => {
  describe('safePrefix (açık transaction boşluğu)', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    const row = (seq: number, msAgo: number) => ({ seq: String(seq), changed_at: at(msAgo, now) });

    it('ardışık sıraları olduğu gibi verir', () => {
      const { safe, waiting } = safePrefix([row(11, 1), row(12, 1), row(13, 1)], 10n, now, 60_000);
      expect(safe.map((r) => r.seq)).toEqual(['11', '12', '13']);
      expect(waiting).toBe(false);
    });

    it('yeni bir boşlukta durur (bitmemiş transaction beklenir)', () => {
      const { safe, waiting } = safePrefix([row(11, 1000), row(13, 1000), row(14, 500)], 10n, now, 60_000);
      expect(safe.map((r) => r.seq)).toEqual(['11']);
      expect(waiting).toBe(true);
    });

    it('imleçten hemen sonraki boşlukta hiç vermez', () => {
      const { safe, waiting } = safePrefix([row(12, 100)], 10n, now, 60_000);
      expect(safe).toEqual([]);
      expect(waiting).toBe(true);
    });

    it('eski boşluk geri alınmış sayılır ve geçilir', () => {
      const { safe, waiting } = safePrefix([row(11, 90_000), row(15, 90_000), row(16, 10)], 10n, now, 60_000);
      expect(safe.map((r) => r.seq)).toEqual(['11', '15', '16']);
      expect(waiting).toBe(false);
    });
  });

  describe('rota kararları', () => {
    const info = (p: Partial<SyncRouteInfo>): SyncRouteInfo => ({
      write: true,
      skip: false,
      journal: false,
      primaryOnly: false,
      shopWrite: false,
      noShopWrite: false,
      ...p,
    });

    it('dükkân verisine yazan istek giden kutusuna yazılır, okuma yazılmaz', () => {
      expect(shouldJournal(info({ shopWrite: true }))).toBe(true);
      expect(shouldJournal(info({ write: false, shopWrite: false }))).toBe(false);
    });

    it('nabız/oturum gibi işaretli uçlar yazılmaz; Corel klasör bildirimi yazılır', () => {
      expect(shouldJournal(info({ shopWrite: true, skip: true }))).toBe(false);
      expect(shouldJournal(info({ journal: true, noShopWrite: true }))).toBe(true);
    });

    it('yerel sunucuda ekip/kullanıcı/yedek gibi dükkânsız yazmalar ve işaretliler reddedilir', () => {
      expect(rejectOnReplica(info({ noShopWrite: true }))).toBe(true);
      expect(rejectOnReplica(info({ primaryOnly: true, shopWrite: true }))).toBe(true);
      expect(rejectOnReplica(info({ noShopWrite: true, skip: true }))).toBe(false); // oturum açma
      expect(rejectOnReplica(info({ noShopWrite: true, journal: true }))).toBe(false); // Corel
      expect(rejectOnReplica(info({ shopWrite: true }))).toBe(false);
      expect(rejectOnReplica(info({ write: false, noShopWrite: false }))).toBe(false);
    });
  });

  describe('iç istek başlıkları', () => {
    it('gizli değer JWT anahtarından türer ve dışarıdan tahmin edilemez', () => {
      const s = replaySecret('jwt-secret');
      expect(s).toHaveLength(64);
      expect(isReplaySecret(s, s)).toBe(true);
      expect(isReplaySecret(replaySecret('baska'), s)).toBe(false);
      expect(isReplaySecret(undefined, s)).toBe(false);
    });

    it('JSON üst bilgisi base64url ile gider gelir; bozuksa yok sayılır', () => {
      const v = { clientIds: [{ table: 'quotes', id: 'x' }], docNos: { quotes: 'TKF-2026-0001' } };
      expect(decodeHeaderJson(encodeHeaderJson(v))).toEqual(v);
      expect(decodeHeaderJson('%%%')).toBeUndefined();
    });
  });

  describe('push ön denetimi', () => {
    const replica = { id: 'r1', name: 'Dükkân PC', shopIds: ['0f8fad5b-d9cb-469f-a165-70867728950e'] };
    const service = new SyncPushService(
      { signAsync: jest.fn() } as never,
      { touch: jest.fn() } as never,
      { query: jest.fn(async () => []) } as never,
      { get: (k: string) => (k === 'jwt' ? { accessSecret: 's' } : undefined) } as never,
    );
    const base = {
      opId: 'op-12345678',
      actor: 'user' as const,
      userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      shopId: replica.shopIds[0],
      method: 'POST',
      path: '/v1/customers',
      body: { name: 'X' },
      occurredAt: '2026-10-21T10:00:00Z',
    };

    it('yönetim, oturum ve eşitleme yolları aktarılamaz', async () => {
      for (const path of ['/v1/users', '/v1/shops/abc/members', '/v1/auth/login', '/v1/sync/push', '/v1/backups/restore', '/v1/system/sync']) {
        const [r] = await service.push(replica as never, [{ ...base, path }]);
        expect(r.outcome).toBe('rejected');
      }
    });

    it('yerel sunucunun yetkili olmadığı dükkân reddedilir', async () => {
      const [r] = await service.push(replica as never, [
        { ...base, shopId: '9b2f5a3e-1111-4c4c-8a8a-000000000000' },
      ]);
      expect(r).toMatchObject({ outcome: 'rejected', httpStatus: 403 });
    });

    it('merkezde olmayan kullanıcının işlemi reddedilir', async () => {
      const [r] = await service.push(replica as never, [base]);
      expect(r).toMatchObject({ outcome: 'rejected', httpStatus: 401 });
    });

    it('bozuk işlem kimliği ve yol reddedilir', async () => {
      const [a, b] = await service.push(replica as never, [
        { ...base, opId: 'kisa' },
        { ...base, path: '/v1/../v1/users' },
      ]);
      expect(a.outcome).toBe('rejected');
      expect(b.outcome).toBe('rejected');
    });
  });

  describe('ShopContext.now / preferredDocNo', () => {
    it('yeniden oynatmada işlemin asıl zamanını ve numarasını verir', () => {
      const when = new Date('2026-10-20T08:30:00Z');
      ShopContext.run(
        { sync: { replay: { replicaId: 'r', actor: 'user', occurredAt: when, clientIds: {}, docNos: { quotes: 'TKF-2026-0042' } } } },
        () => {
          expect(ShopContext.now().toISOString()).toBe(when.toISOString());
          expect(ShopContext.preferredDocNo('quotes')).toBe('TKF-2026-0042');
          expect(ShopContext.preferredDocNo('shop_transfers')).toBeUndefined();
        },
      );
      ShopContext.run({}, () => {
        expect(Math.abs(ShopContext.now().getTime() - Date.now())).toBeLessThan(1000);
      });
    });
  });
});

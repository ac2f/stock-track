import { AsyncLocalStorage } from 'async_hooks';

/**
 * Bir isteğin (ya da zamanlanmış görevin) hangi dükkân adına çalıştığı.
 *
 * Her HTTP isteği boş bir bağlamla başlar (ShopContextMiddleware); dükkân
 * erişimi doğrulanınca ShopAccessGuard `shopId`'yi yazar. Corel anahtarı ve
 * müşteri portalı jetonu da kendi dükkânlarını aynı yolla yazar.
 *
 * Veritabanı katmanı (shop-scope.typeorm.ts) dükkâna bağlı her tabloyu bu
 * değere göre süzer; bağlam yoksa sorgu HATA verir (yanlışlıkla başka
 * dükkânın verisini okumaktansa çalışmamak yeğdir).
 */
export interface ShopStore {
  shopId?: string;
  userId?: string;
  /** Bilerek tüm dükkânlar üzerinde çalışan kod (açılış göçü, yönetim). */
  unscoped?: boolean;
  /** Eşitleme (docs/SYNC.md): yeniden oynatılan ya da giden kutusuna yazılan istek. */
  sync?: SyncRequestState;
}

/** Bir isteğin eşitlemeyle ilgili durumu. */
export interface SyncRequestState {
  /**
   * Merkezde, replikadan gelen işlemin yeniden oynatılması: kayıtlar
   * replikadaki kimlikleri ve belge numaralarıyla, asıl tarihinde açılır.
   */
  replay?: {
    replicaId: string;
    actor: 'user' | 'corel';
    occurredAt?: Date;
    /** Tablo başına, eklenme sırasıyla kullanılacak kimlikler. */
    clientIds: Record<string, string[]>;
    /** Tablo başına istenen belge numarası (ör. quotes → TKF-2026-0042). */
    docNos: Record<string, string>;
  };
  /** İstek boyunca eklenen kayıtlar (giden kutusu / yeniden oynatma yanıtı için). */
  capture?: {
    inserted: { table: string; id: string }[];
    docNos: Record<string, string>;
  };
}

const storage = new AsyncLocalStorage<ShopStore>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dükkâna bağlı bir tablo, dükkân bağlamı olmadan kullanıldı. */
export class MissingShopContextError extends Error {
  constructor(what: string) {
    super(`Dükkân bağlamı yok: ${what}`);
    this.name = 'MissingShopContextError';
  }
}

export const ShopContext = {
  /** Yeni bir bağlam açar (istek başına middleware). */
  run<T>(store: ShopStore, fn: () => T): T {
    return storage.run(store, fn);
  },

  /** `fn`'i verilen dükkân adına çalıştırır (zamanlanmış görev, bot, tohum). */
  forShop<T>(shopId: string, fn: () => T): T {
    if (!UUID_RE.test(shopId)) throw new Error(`Geçersiz dükkân kimliği: ${shopId}`);
    return storage.run({ shopId }, fn);
  },

  /** `fn`'i dükkân süzgeci OLMADAN çalıştırır. Yalnızca bilinçli yönetim kodu. */
  unscoped<T>(fn: () => T): T {
    return storage.run({ unscoped: true }, fn);
  },

  current(): ShopStore | undefined {
    return storage.getStore();
  },

  shopId(): string | undefined {
    return storage.getStore()?.shopId;
  },

  requireShopId(): string {
    const id = storage.getStore()?.shopId;
    if (!id) throw new MissingShopContextError('bu işlem bir dükkân gerektirir');
    return id;
  },

  /**
   * İçinde bulunulan isteğin bağlamına dükkânı yazar. Guard'lar (oturum,
   * Corel anahtarı) ve portal jetonu kullanır; bağlam middleware'de açılmış
   * olmalıdır.
   */
  enter(shopId: string, userId?: string): void {
    const store = storage.getStore();
    if (!store) throw new MissingShopContextError('istek bağlamı açılmamış');
    if (!UUID_RE.test(shopId)) throw new Error(`Geçersiz dükkân kimliği: ${shopId}`);
    store.shopId = shopId;
    if (userId) store.userId = userId;
  },

  isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
  },

  /**
   * İşlemin iş tarihi için "şimdi". Replikadan yeniden oynatılan istekte
   * işlemin yerelde yapıldığı an döner; böylece çevrimdışı girilen satış,
   * tahsilat, alış ... bağlantı geldiği saatle değil asıl saatiyle kaydolur.
   */
  now(): Date {
    const at = storage.getStore()?.sync?.replay?.occurredAt;
    return at ? new Date(at.getTime()) : new Date();
  },

  /** Yeniden oynatmada replikanın verdiği belge numarası (yoksa undefined). */
  preferredDocNo(table: string): string | undefined {
    return storage.getStore()?.sync?.replay?.docNos?.[table];
  },
};

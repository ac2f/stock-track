import { SetMetadata } from '@nestjs/common';
import type { CacheGroupName } from './cache.groups';

export const CACHED_KEY = 'cache:http';

export interface CachedOptions {
  /** Hangi tablolara yazılınca silinir (bkz. cache.groups.ts). */
  group: CacheGroupName;
  /** Saniye. Silme kendiliğinden olur; süre, uygulama dışı değişikliklere karşı üst sınırdır. */
  ttl: number;
  /** 'shop' (varsayılan): dükkâna özel. 'global': platform geneli (herkese aynı). */
  scope?: 'shop' | 'global';
  /** Yanıt oturumdaki kullanıcıya göre değişiyorsa true. */
  perUser?: boolean;
}

/**
 * GET uç noktasının yanıtını önbelleğe alır. Yetki denetimi (guard) önbellekten
 * ÖNCE çalışır; yalnız yetkili isteğin yanıtı saklanır ve verilir.
 * Uç nokta, GRUBUN kapsadığı tablolardan başkasını okumuyor olmalıdır.
 */
export const Cached = (options: CachedOptions) => SetMetadata(CACHED_KEY, options);

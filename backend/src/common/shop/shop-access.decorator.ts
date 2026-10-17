import { SetMetadata } from '@nestjs/common';
import type { AccessLevel, ShopModule } from './shop-permissions';

export const SHOP_SCOPE_KEY = 'shop:scope';
export const SHOP_ACCESS_KEY = 'shop:access';
export const NO_SHOP_KEY = 'shop:none';
export const ANY_SHOP_MEMBER_KEY = 'shop:anyMember';

/**
 * Controller (ya da rota) bir dükkân alanına aittir. Gereken seviye HTTP
 * yönteminden çıkar: GET/HEAD → okuma, diğerleri → yazma.
 *
 *   @ShopScope('quotes')
 *   @Controller('quotes')
 */
export const ShopScope = (module: ShopModule) => SetMetadata(SHOP_SCOPE_KEY, module);

/**
 * Rotanın alanını ve seviyesini açıkça belirtir (ör. hesaplama yapan bir
 * POST yalnız okuma ister; teklif PDF'i teklif okuması ister).
 */
export const ShopAccess = (module: ShopModule, level: AccessLevel) =>
  SetMetadata(SHOP_ACCESS_KEY, { module, level });

/** Dükkân gerektirmeyen rota (oturum, dükkân yönetimi, sistem işleri). */
export const NoShop = () => SetMetadata(NO_SHOP_KEY, true);

/**
 * Dükkânın her üyesine açık rota: alan izni aranmaz (ör. formlarda seçilen
 * depo/makine/banka hesabı listeleri, arayüz başlığındaki işletme adı).
 */
export const AnyShopMember = () => SetMetadata(ANY_SHOP_MEMBER_KEY, true);

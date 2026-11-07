import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('ShopProfileBackfill');

/**
 * Yükseltmeden önce işletme adı/telefonu/adresi "Ayarlar > İşletme bilgileri"nde duruyordu; rehber
 * profilinde ise boştur. Yükseltilen kurulumun ilk açılışında, profilde boş olan alanlar bu eski
 * bilgilerden doldurulur — işletme bilgilerini baştan yazmak zorunda kalmaz.
 *
 * YALNIZ yükseltilen açılışta çalıştırılır (main.ts): sonradan profilde bilerek boşaltılan alan
 * bir sonraki açılışta geri dolmasın. İl/ilçe eski verilerden çıkarılamaz; işletme profilinden seçilir.
 */
export async function backfillShopProfiles(dataSource: DataSource): Promise<number> {
  const rows: unknown[] = await dataSource.query(
    `UPDATE shops s SET
        legal_name   = COALESCE(s.legal_name,   NULLIF(btrim(a.business_name), '')),
        phone        = COALESCE(s.phone,        NULLIF(btrim(a.business_phone), '')),
        address_line = COALESCE(s.address_line, NULLIF(btrim(a.business_address), ''))
       FROM (SELECT DISTINCT ON (shop_id) shop_id, business_name, business_phone, business_address
               FROM app_settings WHERE deleted_at IS NULL AND shop_id IS NOT NULL
              ORDER BY shop_id, created_at) a
      WHERE a.shop_id = s.id
        AND (s.legal_name IS NULL OR s.phone IS NULL OR s.address_line IS NULL)
        AND (NULLIF(btrim(a.business_name), '') IS NOT NULL
          OR NULLIF(btrim(a.business_phone), '') IS NOT NULL
          OR NULLIF(btrim(a.business_address), '') IS NOT NULL)
      RETURNING s.id`,
  );
  const n = Array.isArray(rows[0]) ? (rows[0] as unknown[]).length : rows.length;
  if (n) logger.log(`${n} işletmenin profili eski işletme bilgilerinden dolduruldu.`);
  return n;
}

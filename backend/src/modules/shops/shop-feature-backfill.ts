import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('ShopFeatureBackfill');

/**
 * Özellik yetkileri (Corel vb.) eklenmeden önce Corel'i zaten kullanan işletmeler
 * yükseltmeden sonra kesintiye uğramasın: Corel anahtarı üretilmiş ya da runner
 * bağlanmış olan her işletmeye Corel özelliği AÇIK olarak yazılır.
 *
 * Yalnız `corel` anahtarı hiç yazılmamış işletmelere dokunur; sistem sahibi bir
 * işletmenin Corel'ini sonradan kapatırsa (false) bir sonraki açılışta yeniden
 * açılmaz. Tekrar çalışması zararsızdır.
 */
export async function backfillShopFeatures(dataSource: DataSource): Promise<number> {
  const rows: unknown[] = await dataSource.query(
    `UPDATE shops s
        SET features = COALESCE(s.features, '{}'::jsonb) || '{"corel": true}'::jsonb
      WHERE NOT (COALESCE(s.features, '{}'::jsonb) ? 'corel')
        AND (
          EXISTS (SELECT 1 FROM app_settings a
                   WHERE a.shop_id = s.id AND a.deleted_at IS NULL AND a.corel_api_key <> '')
          OR EXISTS (SELECT 1 FROM corel_runners r WHERE r.shop_id = s.id)
        )
      RETURNING s.id`,
  );
  const n = Array.isArray(rows[0]) ? (rows[0] as unknown[]).length : rows.length;
  if (n) logger.log(`${n} işletmeye (Corel'i zaten kullanan) Corel özelliği açık olarak yazıldı.`);
  return n;
}

import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/** Stok kodu öneki: tür kodundan (büyük harf/rakam, en çok 10 karakter); yoksa "STK". */
export function skuPrefix(categoryCode?: string | null): string {
  const p = (categoryCode ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  return p || 'STK';
}

/** "PLEKSI" + 42 → "PLEKSI-000042". */
export function formatSku(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(6, '0')}`;
}

/**
 * `count` adet stok kodunu TEK sayaç güncellemesiyle ayırır (işletme başına sıra; kodlar
 * `TÜR-000123` biçimindedir: kısa, okunur, tür/marka/renk/ebadı yeniden yazmaz — bunlar zaten kalemin
 * kendi alanlarındadır).
 *
 * Eskiden kod tür+marka+renk+kalınlık+ebattan üretilir ve benzersiz çıkana dek kalem başına
 * `findOne` döngüsüyle denenirdi (aynı özellikte N tabaka için O(N²) sorgu). Burada sayaç atomik
 * artar, çakışma (elle girilmiş/eski bir kod) tek sorguda denetlenir; çakışırsa sayaç zaten
 * ilerlediğinden yeni aralık alınır. Silinmiş kalemlerin kodları da dolu sayılır (benzersiz indeks
 * silinmişleri de kapsar).
 */
export async function allocatePlateSkus(
  manager: EntityManager,
  shopId: string,
  categoryCode: string | null | undefined,
  count: number,
): Promise<string[]> {
  if (count <= 0) return [];
  const prefix = skuPrefix(categoryCode);
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows: { value: string }[] = await manager.query(
      `INSERT INTO shop_counters (shop_id, key, value) VALUES ($1, 'plate_sku', $2)
         ON CONFLICT (shop_id, key) DO UPDATE SET value = shop_counters.value + EXCLUDED.value
       RETURNING value`,
      [shopId, count],
    );
    const last = Number(rows[0].value);
    const skus = Array.from({ length: count }, (_, i) => formatSku(prefix, last - count + 1 + i));
    const taken: { sku: string }[] = await manager.query(
      `SELECT sku FROM material_plates WHERE shop_id = $1 AND sku = ANY($2::text[])`,
      [shopId, skus],
    );
    if (!taken.length) return skus;
  }
  throw new ConflictException('Stok kodu üretilemedi; lütfen tekrar deneyin.');
}

import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('PlateNameCompaction');

/**
 * Eski satırlarda her kalemin adı ayrıca saklanıyordu ("Pleksi Akpolimer[Şeffaf K-1] 3.00x1220.00x2440.00");
 * bu metin kalemin kendi alanlarından (marka, renk, kalınlık, şablonun ebadı, tür adı) zaten türetilebilir.
 * Bu geçiş, saklı adı türetilmiş adla BİREBİR aynı olan satırlarda adı boşaltır (NULL): görünen ad değişmez
 * (aynı metin okurken üretilir), yalnız depolama boşalır.
 *
 * Güvenli kural: eşleşme birebir olmalı. Elle yazılmış ya da sunucunun eski biçimindeki (tür önekisiz)
 * adlar, kalemin ebadı şablondan farklıysa, vb. hiç dokunulmaz — olduğu gibi kalır. Tekrar çalışması
 * zararsızdır (boşaltılacak satır kalmaz). Değişiklik günlüğüne yazılmaz (`sync_origin = upstream`):
 * her sunucu (merkez ve yerel) bu geçişi kendi veritabanında yapar, trafik doğmaz.
 *
 * Eşleşme koşulu `plate-name.util.ts › derivePlateName` ile aynı biçimi üretir (testle sınanır).
 */
export async function compactPlateNames(dataSource: DataSource): Promise<number> {
  return dataSource.transaction(async (m) => {
    await m.query(`SELECT set_config('stocktrack.sync_origin', 'upstream', true)`);
    const res: [unknown[], number] = await m.query(
      `UPDATE material_plates p SET name = NULL
         FROM material_templates t
         JOIN material_categories c ON c.id = t.category_id
         LEFT JOIN material_sizes sz ON sz.id = t.default_size_id
        WHERE t.id = p.template_id
          AND p.name IS NOT NULL
          AND p.size_id IS NOT DISTINCT FROM t.default_size_id
          AND p.name = btrim(c.name) || ' ' || coalesce(p.brand, '—') || '['
              || coalesce(CASE WHEN p.color IS NULL THEN NULL
                               WHEN coalesce(p.color_code, '') <> '' THEN p.color || ' ' || p.color_code
                               ELSE p.color END, '—')
              || '] ' || coalesce(p.thickness_mm::text, '—')
              || CASE WHEN sz.id IS NULL THEN 'x—x—' ELSE 'x' || sz.width_mm::text || 'x' || sz.height_mm::text END`,
    );
    const changed = Array.isArray(res) ? (res[1] ?? 0) : 0;
    if (changed) logger.log(`${changed} kalemin türetilebilir adı depolamadan kaldırıldı (görünen ad aynı).`);
    return changed;
  });
}

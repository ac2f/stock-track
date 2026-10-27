import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ShopContext } from '../../common/shop/shop-context';
import { MaterialPlate } from './entities/material-plate.entity';
import { StockLevel } from './entities/stock-level.entity';

const logger = new Logger('AreaLotsMigration');

const quote = (c: string) => `"${c}"`;

/**
 * Tabaka (AREA) kayıtları fiziksel tabaka başınadır: kesimler kaydın en/boyunu
 * düşürür ve tabaka bitince kayıt stoktan kalkar. Önceki sürümlerde "5 adet"
 * girilen ya da alınan tabaka tek kayıtta adet olarak durabiliyordu; tek bir
 * satış o kaydın bütün adedini siliyordu. Bu geçiş, adedi 1'den büyük her
 * tabaka stoğunu (depo ve sahip bazında) adedi kadar AYRI tabaka kaydına böler.
 * Her açılışta çalışır; tekrar çalışması zararsızdır (bölünecek kayıt kalmaz).
 *
 * Şema senkronizasyonundan sonra, herhangi bir istekten önce çağrılır.
 */
export async function splitAreaLots(dataSource: DataSource): Promise<number> {
  return ShopContext.unscoped(async () => {
    const lots: { level_id: string; plate_id: string; quantity: string }[] = await dataSource.query(
      `SELECT sl.id AS level_id, sl.plate_id, sl.quantity
         FROM stock_levels sl
         JOIN material_plates p ON p.id = sl.plate_id AND p.deleted_at IS NULL
        WHERE p.measurement_type = 'area' AND sl.deleted_at IS NULL AND sl.quantity >= 2`,
    );
    if (!lots.length) return 0;

    const plateCols = dataSource.getMetadata(MaterialPlate).columns.map((c) => c.databaseName);
    const levelCols = dataSource.getMetadata(StockLevel).columns.map((c) => c.databaseName);
    const plateSelect = plateCols
      .map((c) => {
        if (c === 'id') return 'gen_random_uuid()';
        if (c === 'created_at' || c === 'updated_at') return 'now()';
        if (c === 'quantity_in_stock') return '0';
        // Stok kodu (dükkân başına benzersiz): kopyalara rastgele sonek.
        if (c === 'sku') return `CASE WHEN sku IS NULL THEN NULL ELSE sku || '-' || substr(md5(random()::text), 1, 6) END`;
        return quote(c);
      })
      .join(', ');
    const levelSelect = levelCols
      .map((c) => {
        if (c === 'id') return 'gen_random_uuid()';
        if (c === 'created_at' || c === 'updated_at') return 'now()';
        if (c === 'plate_id') return '$2';
        if (c === 'quantity') return '1';
        return quote(c);
      })
      .join(', ');

    let created = 0;
    await dataSource.transaction(async (m) => {
      for (const lot of lots) {
        const total = Number(lot.quantity);
        const extra = Math.floor(total) - 1;
        for (let i = 0; i < extra; i++) {
          const [{ id }]: { id: string }[] = await m.query(
            `INSERT INTO material_plates (${plateCols.map(quote).join(', ')})
             SELECT ${plateSelect} FROM material_plates WHERE id = $1 RETURNING id`,
            [lot.plate_id],
          );
          await m.query(
            `INSERT INTO stock_levels (${levelCols.map(quote).join(', ')})
             SELECT ${levelSelect} FROM stock_levels WHERE id = $1`,
            [lot.level_id, id],
          );
          created++;
        }
        await m.query(`UPDATE stock_levels SET quantity = $2 WHERE id = $1`, [
          lot.level_id,
          total - extra,
        ]);
      }
      // İşletme stoğunun toplam önbelleği (plaka başına) yeniden hesaplanır.
      await m.query(
        `UPDATE material_plates p
            SET quantity_in_stock = COALESCE((
                  SELECT SUM(sl.quantity) FROM stock_levels sl
                   WHERE sl.plate_id = p.id AND sl.owner_customer_id IS NULL AND sl.deleted_at IS NULL), 0)
          WHERE p.measurement_type = 'area' AND p.deleted_at IS NULL`,
      );
    });
    logger.log(`${lots.length} tabaka partisi ${created} ek tabaka kaydına bölündü.`);
    return created;
  });
}

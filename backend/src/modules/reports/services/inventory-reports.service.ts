import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { roundMoney } from '../../../common/utils/area.util';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { PlateCostService } from '../../materials/services/plate-cost.service';
import { StockLevel } from '../../materials/entities/stock-level.entity';
import { ShopContext } from '../../../common/shop/shop-context';

export interface WarehouseStockValue {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  /** Alış maliyetiyle değer (baz para birimi); alış fiyatı bilinmeyen kalem 0 sayılır. */
  value: number;
  /** Alış fiyatı bilinmediği için değeri hesaplanamayan kalem sayısı. */
  unvaluedItems: number;
}

export interface ConsignmentByOwner {
  ownerCustomerId: string;
  ownerName: string;
  quantity: number;
  itemCount: number;
}

export interface StockValueReport {
  totalValue: number;
  /** Değeri hesaplanamayan (alış kaydı olmayan) kalem sayısı — toplam değer bu kadar eksiktir. */
  unvaluedItems: number;
  byWarehouse: WarehouseStockValue[];
  consignmentByOwner: ConsignmentByOwner[];
}

interface LevelRow {
  warehouseId: string;
  warehouseName: string;
  plateId: string;
  measurementType: MeasurementType;
  quantity: string;
  widthMm: string | null;
  heightMm: string | null;
}

@Injectable()
export class InventoryReportsService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly stockRepo: Repository<StockLevel>,
    private readonly costs: PlateCostService,
  ) {}

  /**
   * Stok değer raporu. İşletme stoğunun (sahipsiz) değeri depo bazında,
   * kalemin alış maliyetiyle hesaplanır: kalemin son alışı, yoksa aynı ürün
   * türünün son alışı (alış tarihindeki kurla baz para birimine çevrilmiş).
   * Tabakada maliyet m² başınadır, değer KALAN ebattan hesaplanır (kesilmiş
   * tabaka tam fiyatla sayılmaz); rulo/şeritte metre, diğerinde adet başına.
   * Hiç alış kaydı olmayan kalem 0 değerlidir ve `unvaluedItems`te sayılır.
   * Ayrıca konsinye stok sahip bazında listelenir.
   */
  async stockValue(warehouseId?: string): Promise<StockValueReport> {
    // Ham SQL dükkân süzgecinden geçmez: dükkân koşulu elle yazılır.
    const shopId = ShopContext.requireShopId();
    const levels: LevelRow[] = await this.stockRepo.query(
      `
      SELECT w.id AS "warehouseId", w.name AS "warehouseName", sl.plate_id AS "plateId",
             p.measurement_type AS "measurementType", sl.quantity AS "quantity",
             p.width_mm AS "widthMm", p.height_mm AS "heightMm"
      FROM stock_levels sl
      JOIN warehouses w ON w.id = sl.warehouse_id
      JOIN material_plates p ON p.id = sl.plate_id AND p.deleted_at IS NULL
      WHERE sl.owner_customer_id IS NULL
        AND sl.deleted_at IS NULL
        AND sl.quantity <> 0
        AND sl.shop_id = $2
        AND ($1::uuid IS NULL OR sl.warehouse_id = $1::uuid)
      `,
      [warehouseId ?? null, shopId],
    );
    const costs = await this.costs.forPlates(levels.map((l) => l.plateId));

    const wh = new Map<string, WarehouseStockValue>();
    const unvaluedPlates = new Set<string>();
    for (const l of levels) {
      let row = wh.get(l.warehouseId);
      if (!row) {
        row = { warehouseId: l.warehouseId, warehouseName: l.warehouseName, quantity: 0, value: 0, unvaluedItems: 0 };
        wh.set(l.warehouseId, row);
      }
      const qty = Number(l.quantity);
      row.quantity += qty;
      const cost = costs[l.plateId];
      if (!cost || cost.unitCost == null) {
        row.unvaluedItems++;
        unvaluedPlates.add(l.plateId);
        continue;
      }
      // Ölçü: tabakada kalan m² (adet = 1 tabaka), diğerinde stok miktarı.
      const measure =
        l.measurementType === MeasurementType.AREA
          ? ((Number(l.widthMm) || 0) / 1000) * ((Number(l.heightMm) || 0) / 1000) * qty
          : qty;
      row.value += cost.unitCost * measure;
    }
    const byWarehouse = [...wh.values()]
      .map((r) => ({ ...r, quantity: roundMoney(r.quantity), value: roundMoney(r.value) }))
      .sort((a, b) => b.value - a.value);

    const consignmentRaw = await this.stockRepo.query(
      `
      SELECT sl.owner_customer_id AS "ownerCustomerId",
             c.name AS "ownerName",
             COALESCE(SUM(sl.quantity), 0) AS "quantity",
             COUNT(DISTINCT sl.plate_id) AS "itemCount"
      FROM stock_levels sl
      JOIN customers c ON c.id = sl.owner_customer_id
      WHERE sl.owner_customer_id IS NOT NULL
        AND sl.deleted_at IS NULL
        AND sl.quantity > 0
        AND sl.shop_id = $1
      GROUP BY sl.owner_customer_id, c.name
      ORDER BY "quantity" DESC
      `,
      [shopId],
    );

    const consignmentByOwner: ConsignmentByOwner[] = consignmentRaw.map(
      (r: Record<string, string>) => ({
        ownerCustomerId: r.ownerCustomerId,
        ownerName: r.ownerName,
        quantity: Number(r.quantity),
        itemCount: Number(r.itemCount),
      }),
    );

    const totalValue = roundMoney(byWarehouse.reduce((s, w) => s + w.value, 0));
    return { totalValue, unvaluedItems: unvaluedPlates.size, byWarehouse, consignmentByOwner };
  }
}

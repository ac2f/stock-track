import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { roundMoney } from '../../../common/utils/area.util';
import { StockLevel } from '../../materials/entities/stock-level.entity';

export interface WarehouseStockValue {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  value: number; // birim maliyet = son alış fiyatı
}

export interface ConsignmentByOwner {
  ownerCustomerId: string;
  ownerName: string;
  quantity: number;
  itemCount: number;
}

export interface StockValueReport {
  totalValue: number;
  byWarehouse: WarehouseStockValue[];
  consignmentByOwner: ConsignmentByOwner[];
}

@Injectable()
export class InventoryReportsService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly stockRepo: Repository<StockLevel>,
  ) {}

  /**
   * Stok değer raporu. İşletme stoğunun (sahipsiz) değeri depo bazında,
   * birim maliyet olarak son alış fiyatı kullanılarak hesaplanır. Ayrıca
   * konsinye stok sahip bazında listelenir.
   */
  async stockValue(warehouseId?: string): Promise<StockValueReport> {
    const byWarehouseRaw = await this.stockRepo.query(
      `
      SELECT w.id AS "warehouseId",
             w.name AS "warehouseName",
             COALESCE(SUM(sl.quantity), 0) AS "quantity",
             COALESCE(SUM(sl.quantity * COALESCE(uc.unit_price, 0)), 0) AS "value"
      FROM stock_levels sl
      JOIN warehouses w ON w.id = sl.warehouse_id
      LEFT JOIN LATERAL (
        SELECT poi.unit_price
        FROM purchase_order_items poi
        WHERE poi.plate_id = sl.plate_id AND poi.deleted_at IS NULL
        ORDER BY poi.created_at DESC
        LIMIT 1
      ) uc ON true
      WHERE sl.owner_customer_id IS NULL
        AND sl.deleted_at IS NULL
        AND ($1::uuid IS NULL OR sl.warehouse_id = $1::uuid)
      GROUP BY w.id, w.name
      ORDER BY "value" DESC
      `,
      [warehouseId ?? null],
    );

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
      GROUP BY sl.owner_customer_id, c.name
      ORDER BY "quantity" DESC
      `,
    );

    const byWarehouse: WarehouseStockValue[] = byWarehouseRaw.map((r: Record<string, string>) => ({
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      quantity: Number(r.quantity),
      value: roundMoney(Number(r.value)),
    }));

    const consignmentByOwner: ConsignmentByOwner[] = consignmentRaw.map(
      (r: Record<string, string>) => ({
        ownerCustomerId: r.ownerCustomerId,
        ownerName: r.ownerName,
        quantity: Number(r.quantity),
        itemCount: Number(r.itemCount),
      }),
    );

    const totalValue = roundMoney(
      byWarehouse.reduce((s, w) => s + w.value, 0),
    );

    return { totalValue, byWarehouse, consignmentByOwner };
  }
}

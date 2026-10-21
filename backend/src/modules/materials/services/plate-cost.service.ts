import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { roundMoney } from '../../../common/utils/area.util';
import { ShopContext } from '../../../common/shop/shop-context';
import { CurrencyService } from '../../currency/currency.service';
import { MaterialPlate } from '../entities/material-plate.entity';

/** Bir malzemenin alış maliyeti (satın almalardan). */
export interface PlateCost {
  plateId: string;
  /** Ölçü birimi başına maliyet (baz para biriminde): m² / metre / adet / kg. */
  unitCost: number | null;
  unit: MeasurementType;
  /** Satın almadaki birim fiyat (tabaka / metre / adet başına), girildiği para biriminde. */
  purchaseUnitPrice: number;
  currency: string;
  purchaseDate: string;
  supplierName: string | null;
  /**
   * 'plate': bu kalemin kendi alışı; 'template': aynı ürün türünün son alışı
   * (kesilip kalan parça ya da sonradan açılmış kalem için).
   */
  source: 'plate' | 'template';
}

interface PurchaseRow {
  key: string;
  unit_price: string;
  currency: string;
  purchase_date: Date;
  supplier: string | null;
  width_mm: string | null;
  height_mm: string | null;
  item_width_mm: string | null;
  item_height_mm: string | null;
}

/**
 * Satın alınan malzemelerin maliyeti: satış kaleminde "kâr" bunun üzerinden
 * hesaplanır. Kalemin son alışı, yoksa aynı ürün türünden son alış kullanılır.
 * Tabaka alışı (tabaka başına) standart tabaka alanına bölünüp m² maliyetine
 * çevrilir; döviz, alış tarihindeki kurla baz para birimine çevrilir.
 * Satın alma kaydı olmayan malzemede maliyet yoktur (kâr gösterilmez).
 */
@Injectable()
export class PlateCostService {
  constructor(
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
    private readonly dataSource: DataSource,
    private readonly currency: CurrencyService,
  ) {}

  async forPlates(plateIds: string[]): Promise<Record<string, PlateCost>> {
    const ids = [...new Set(plateIds.filter(Boolean))];
    if (!ids.length) return {};
    // Satılıp tükenen (silinmiş) kalemlerin maliyeti de bilinsin.
    const plates = await this.platesRepo.find({
      where: { id: In(ids) },
      relations: { template: { defaultSize: true } },
      withDeleted: true,
    });
    const shopId = ShopContext.requireShopId();
    const byPlate = await this.latest('poi.plate_id', ids, shopId);
    const missing = plates.filter((p) => !byPlate.has(p.id) && p.templateId);
    const byTemplate = missing.length
      ? await this.latest('pl.template_id', [...new Set(missing.map((p) => p.templateId))], shopId)
      : new Map<string, PurchaseRow>();

    const out: Record<string, PlateCost> = {};
    for (const p of plates) {
      const own = byPlate.get(p.id);
      const row = own ?? byTemplate.get(p.templateId);
      if (!row) continue;
      const unit = (p.measurementType ?? MeasurementType.AREA) as MeasurementType;
      const price = Number(row.unit_price);
      const cur = (row.currency || this.currency.baseCurrency).toUpperCase();
      const base = await this.toBase(price, cur, row.purchase_date);
      let unitCost: number | null = base;
      if (base != null && unit === MeasurementType.AREA) {
        // Alınan tabakanın alanı: alışta parça ölçüsü yazıldıysa o (kesilmiş
        // parça alımı), yoksa ürün türünün standart tabakası, yoksa kalemin ölçüsü.
        const piece = Number(row.item_width_mm) > 0 && Number(row.item_height_mm) > 0;
        const w = Number(
          piece ? row.item_width_mm : p.template?.defaultSize?.widthMm ?? row.width_mm ?? p.widthMm,
        );
        const h = Number(
          piece ? row.item_height_mm : p.template?.defaultSize?.heightMm ?? row.height_mm ?? p.heightMm,
        );
        const area = w > 0 && h > 0 ? (w / 1000) * (h / 1000) : 0;
        unitCost = area > 0 ? roundMoney(base / area) : null;
      }
      out[p.id] = {
        plateId: p.id,
        unitCost,
        unit,
        purchaseUnitPrice: price,
        currency: cur,
        purchaseDate: new Date(row.purchase_date).toISOString(),
        supplierName: row.supplier,
        source: own ? 'plate' : 'template',
      };
    }
    return out;
  }

  /** Anahtar (kalem ya da ürün türü) başına en son alış satırı. */
  private async latest(keyCol: string, keys: string[], shopId: string): Promise<Map<string, PurchaseRow>> {
    const rows: PurchaseRow[] = await this.dataSource.query(
      `SELECT DISTINCT ON (${keyCol}) ${keyCol} AS key, poi.unit_price, po.currency,
              po.purchase_date, s.name AS supplier, pl.width_mm, pl.height_mm,
              poi.width_mm AS item_width_mm, poi.height_mm AS item_height_mm
         FROM purchase_order_items poi
         JOIN purchase_orders po ON po.id = poi.purchase_order_id AND po.deleted_at IS NULL
         JOIN material_plates pl ON pl.id = poi.plate_id
         LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE ${keyCol} = ANY($1)
          AND poi.shop_id = $2
          AND poi.deleted_at IS NULL
          AND poi.unit_price > 0
        ORDER BY ${keyCol}, po.purchase_date DESC, po.created_at DESC`,
      [keys, shopId],
    );
    return new Map(rows.map((r) => [r.key, r]));
  }

  private async toBase(amount: number, from: string, at: Date): Promise<number | null> {
    if (from === this.currency.baseCurrency.toUpperCase()) return amount;
    try {
      return roundMoney(await this.currency.toBase(amount, from, new Date(at)));
    } catch {
      try {
        // O tarihten önce kur yoksa son kur.
        return roundMoney(await this.currency.toBase(amount, from));
      } catch {
        return null;
      }
    }
  }
}

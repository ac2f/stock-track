import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { buildPaginatedResult, PaginatedResult } from '../../common/dto/paginated-result';
import { ShopContext } from '../../common/shop/shop-context';
import { foldedWords, sqlFold } from '../../common/utils/search.util';
import { MaterialCategoryEntity } from '../materials/entities/material-category.entity';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import { MaterialTemplate } from '../materials/entities/material-template.entity';
import { ListingQueryDto } from './dto/trade.dto';
import {
  ShopStockShare,
  StockShareKind,
  StockShareVisibility,
} from './entities/shop-stock-share.entity';

/** Kuralın arayüzdeki karşılığı: ne paylaşılıyor, kaç stoklu kalemi kapsıyor. */
export interface StockShareView {
  id: string;
  kind: StockShareKind;
  refId: string;
  /** Kalem/tür/malzeme türü adı. */
  label: string;
  visibility: StockShareVisibility;
  isActive: boolean;
  note: string | null;
  /** Şu an listelenen (stoklu, etkin) kalem sayısı. */
  itemCount: number;
}

/** Başka işletmelerin gördüğü liste satırı: yalnız tanıtım bilgisi (maliyet/müşteri/alış YOK). */
export interface ListingItem {
  plateId: string;
  shop: { id: string; name: string; province: string | null; district: string | null };
  name: string;
  categoryName: string | null;
  templateName: string | null;
  brand: string | null;
  color: string | null;
  thicknessMm: number | null;
  measurementType: string;
  unitOfMeasure: string;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number;
  retailPrice: number | null;
  retailCurrency: string;
}

/**
 * Bir plakanın `viewer` işletmesine LİSTELENİYOR olma koşulu (SQL parçası). Pazar yeri listesi
 * ve alım talebi doğrulaması AYNI kuralı kullanır; böylece listelenmeyen kalem için talep açılamaz.
 * Parametre sırası: $viewer, ardından çağıranın verdikleri.
 */
export function listedToViewerSql(viewerParam: string): string {
  return `
    p.deleted_at IS NULL AND p.is_active AND p.quantity_in_stock > 0
    AND p.shop_id <> ${viewerParam}::uuid
    AND s.deleted_at IS NULL AND s.is_active AND s.status = 'active'
    AND COALESCE((s.features ->> 'trade')::boolean, true)
    AND NOT EXISTS (
      SELECT 1 FROM shop_partner_grants b
       WHERE b.grantor_shop_id = p.shop_id AND b.grantee_shop_id = ${viewerParam}::uuid AND b.permission = 'block'
         AND b.deleted_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now()))
    AND EXISTS (
      SELECT 1 FROM shop_stock_shares sh
       WHERE sh.shop_id = p.shop_id AND sh.deleted_at IS NULL AND sh.is_active
         AND ((sh.kind = 'plate' AND sh.ref_id = p.id)
           OR (sh.kind = 'template' AND sh.ref_id = p.template_id)
           OR (sh.kind = 'category' AND sh.ref_id = t.category_id))
         AND (sh.visibility = 'public' OR EXISTS (
               SELECT 1 FROM shop_partner_grants g
                WHERE g.grantor_shop_id = p.shop_id AND g.grantee_shop_id = ${viewerParam}::uuid AND g.permission = 'view_stock'
                  AND g.deleted_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now()))))`;
}

/**
 * "Bende var, satıyorum": işletmenin stok paylaşım kuralları (seçili kalemler ya da bir grup)
 * ve diğer işletmelerin gördüğü liste (pazar yeri).
 */
@Injectable()
export class StockSharesService {
  constructor(
    @InjectRepository(ShopStockShare) private readonly shares: Repository<ShopStockShare>,
    @InjectRepository(MaterialPlate) private readonly plates: Repository<MaterialPlate>,
    @InjectRepository(MaterialTemplate) private readonly templates: Repository<MaterialTemplate>,
    @InjectRepository(MaterialCategoryEntity) private readonly categories: Repository<MaterialCategoryEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ── Kendi kurallarım (dükkân bağlamında; ORM süzgeci kayıtları dükkâna ayırır) ──

  async list(): Promise<StockShareView[]> {
    const rows = await this.shares.find({ order: { createdAt: 'DESC' } });
    return Promise.all(rows.map((r) => this.view(r)));
  }

  /**
   * Kural ekler ya da günceller (aynı kalem/grup için tek kural). Kimlik BU dükkânın
   * kaydı olmalı (dükkân süzgeci başkasının kaydını bulamaz).
   */
  async upsert(input: {
    kind: StockShareKind;
    refId: string;
    visibility?: StockShareVisibility;
    isActive?: boolean;
    note?: string | null;
  }): Promise<StockShareView> {
    await this.assertOwnRef(input.kind, input.refId);
    const existing = await this.shares.findOne({ where: { kind: input.kind, refId: input.refId }, withDeleted: true });
    const row =
      existing ??
      this.shares.create({ kind: input.kind, refId: input.refId, visibility: 'public', isActive: true });
    row.deletedAt = null;
    if (input.visibility) row.visibility = input.visibility;
    if (input.isActive !== undefined) row.isActive = input.isActive;
    if (input.note !== undefined) row.note = input.note?.trim() || null;
    return this.view(await this.shares.save(row));
  }

  async update(id: string, patch: { visibility?: StockShareVisibility; isActive?: boolean; note?: string | null }): Promise<StockShareView> {
    const row = await this.shares.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Paylaşım kuralı bulunamadı.');
    if (patch.visibility) row.visibility = patch.visibility;
    if (patch.isActive !== undefined) row.isActive = patch.isActive;
    if (patch.note !== undefined) row.note = patch.note?.trim() || null;
    return this.view(await this.shares.save(row));
  }

  async remove(id: string): Promise<void> {
    const row = await this.shares.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Paylaşım kuralı bulunamadı.');
    await this.shares.softRemove(row);
  }

  /** Bütün kuralları açar/kapatır (tek tuşla "paylaşımı durdur"). */
  async setAll(isActive: boolean): Promise<{ changed: number }> {
    const rows = await this.shares.find();
    for (const r of rows) r.isActive = isActive;
    if (rows.length) await this.shares.save(rows);
    return { changed: rows.length };
  }

  // ── Pazar yeri (başka işletmelerin gördüğü) ───────────────────────

  async browse(viewerShopId: string, q: ListingQueryDto): Promise<PaginatedResult<ListingItem>> {
    const params: unknown[] = [viewerShopId];
    const add = (v: unknown) => (params.push(v), `$${params.length}`);
    const where = [listedToViewerSql('$1')];
    if (q.shopId) where.push(`p.shop_id = ${add(q.shopId)}::uuid`);
    if (q.category?.trim()) where.push(`${sqlFold('c.name')} = ${add(foldedWords(q.category).join(' '))}`);
    for (const w of foldedWords(q.search)) {
      const p = add(`%${w}%`);
      where.push(
        `(${sqlFold('p.name')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('t.name')} LIKE ${p} ESCAPE '\\'
          OR ${sqlFold('c.name')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('p.brand')} LIKE ${p} ESCAPE '\\'
          OR ${sqlFold('p.color')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('s.name')} LIKE ${p} ESCAPE '\\')`,
      );
    }
    const from = `material_plates p
      JOIN shops s ON s.id = p.shop_id
      JOIN material_templates t ON t.id = p.template_id AND t.deleted_at IS NULL
      JOIN material_categories c ON c.id = t.category_id`;
    const cond = where.join(' AND ');
    const [{ n }]: { n: string }[] = await this.dataSource.query(`SELECT COUNT(*) AS n FROM ${from} WHERE ${cond}`, params);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT p.id, p.name, p.brand, p.color, p.thickness_mm, p.measurement_type, p.unit_of_measure,
              p.width_mm, p.height_mm, p.quantity_in_stock, p.retail_price, p.retail_currency,
              t.name AS template_name, c.name AS category_name,
              s.id AS shop_id, s.name AS shop_name, s.province, s.district
         FROM ${from} WHERE ${cond}
        ORDER BY s.name, c.name, p.name
        LIMIT ${add(q.limit)} OFFSET ${add(q.skip)}`,
      params,
    );
    const items = rows.map<ListingItem>((r) => ({
      plateId: String(r.id),
      shop: { id: String(r.shop_id), name: String(r.shop_name), province: (r.province as string) ?? null, district: (r.district as string) ?? null },
      name: String(r.name),
      categoryName: (r.category_name as string) ?? null,
      templateName: (r.template_name as string) ?? null,
      brand: (r.brand as string) ?? null,
      color: (r.color as string) ?? null,
      thicknessMm: r.thickness_mm == null ? null : Number(r.thickness_mm),
      measurementType: String(r.measurement_type),
      unitOfMeasure: String(r.unit_of_measure),
      widthMm: r.width_mm == null ? null : Number(r.width_mm),
      heightMm: r.height_mm == null ? null : Number(r.height_mm),
      quantity: Number(r.quantity_in_stock),
      retailPrice: r.retail_price == null ? null : Number(r.retail_price),
      retailCurrency: String(r.retail_currency ?? 'TRY'),
    }));
    return buildPaginatedResult(items, Number(n), q.page, q.limit);
  }

  /**
   * `sellerShopId`in verilen kalemlerinden hangileri `viewerShopId`ye LİSTELENİYOR?
   * Alım talebi yalnız listelenen kalemler için açılabilir.
   */
  async listedTo(sellerShopId: string, viewerShopId: string, plateIds: string[]): Promise<Set<string>> {
    if (!plateIds.length) return new Set();
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT p.id FROM material_plates p
         JOIN shops s ON s.id = p.shop_id
         JOIN material_templates t ON t.id = p.template_id
        WHERE p.shop_id = $2::uuid AND p.id = ANY($3::uuid[]) AND ${listedToViewerSql('$1')}`,
      [viewerShopId, sellerShopId, plateIds],
    );
    return new Set(rows.map((r) => r.id));
  }

  // ── İç ─────────────────────────────────────────────────────────────

  private async assertOwnRef(kind: StockShareKind, refId: string): Promise<void> {
    ShopContext.requireShopId();
    const repo =
      kind === 'plate' ? this.plates : kind === 'template' ? this.templates : this.categories;
    const found = await (repo as Repository<{ id: string }>).findOne({ where: { id: refId } });
    if (!found) throw new BadRequestException('Seçilen kalem/grup bu işletmenin kataloğunda bulunamadı.');
  }

  private async view(r: ShopStockShare): Promise<StockShareView> {
    let label = '—';
    let itemCount = 0;
    if (r.kind === 'plate') {
      const p = await this.plates.findOne({ where: { id: r.refId }, withDeleted: true });
      label = p?.name ?? '(silinmiş kalem)';
      itemCount = p && !p.deletedAt && p.isActive && Number(p.quantityInStock) > 0 ? 1 : 0;
    } else if (r.kind === 'template') {
      const t = await this.templates.findOne({ where: { id: r.refId }, withDeleted: true });
      label = t?.name ?? '(silinmiş tür)';
      itemCount = await this.plates
        .createQueryBuilder('p')
        .where('p.template_id = :id AND p.is_active = true AND p.quantity_in_stock > 0', { id: r.refId })
        .getCount();
    } else {
      const c = await this.categories.findOne({ where: { id: r.refId }, withDeleted: true });
      label = c?.name ?? '(silinmiş malzeme türü)';
      itemCount = await this.plates
        .createQueryBuilder('p')
        .innerJoin('p.template', 't')
        .where('t.category_id = :id AND p.is_active = true AND p.quantity_in_stock > 0', { id: r.refId })
        .getCount();
    }
    return {
      id: r.id,
      kind: r.kind,
      refId: r.refId,
      label,
      visibility: r.visibility,
      isActive: r.isActive,
      note: r.note ?? null,
      itemCount,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { buildPaginatedResult, PaginatedResult } from '../../common/dto/paginated-result';
import { foldedWords, foldTr, sqlFold } from '../../common/utils/search.util';
import { GeoService } from '../geo/geo.service';
import { QueryDirectoryDto } from './dto/platform.dto';
import { MachineTypesService } from './machine-types.service';

export interface DirectoryMachine {
  id: string;
  name: string;
  typeId: string | null;
  typeName: string | null;
  typePath: string | null;
  widthMm: number | null;
  heightMm: number | null;
  brand: string | null;
  model: string | null;
  quantity: number;
  /** Aramadaki makine süzgecine uyuyor mu (arayüz vurgular). */
  matches: boolean;
}

export interface DirectoryShop {
  id: string;
  name: string;
  legalName: string | null;
  description: string | null;
  province: string | null;
  district: string | null;
  addressLine: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  memberSince: string;
  labels: { id: string; name: string }[];
  machines: DirectoryMachine[];
}

export interface DirectoryMachineHit extends DirectoryMachine {
  shop: { id: string; name: string; province: string | null; district: string | null; phone: string | null; email: string | null };
}

export interface DirectoryFacets {
  provinces: { name: string; count: number }[];
  districts: { name: string; count: number }[];
  labels: { id: string; name: string; count: number }[];
  machineTypes: { id: string; name: string; path: string; count: number }[];
}

/**
 * Rehberde görünen işletme: etkin, profilinde "rehberde görünsün" diyen ve sistem
 * sahibinin rehber özelliğini KAPATMADIĞI (yazılmamışsa açık) işletme.
 */
const SHOP_VISIBLE = `s.deleted_at IS NULL AND s.is_active AND s.status = 'active' AND s.directory_visible
  AND COALESCE((s.features ->> 'directory')::boolean, true)`;

/**
 * İşletme rehberi: işletmeler birbirini il/ilçe, iş kolu etiketi ve makineye
 * (tür + en az şu ebat) göre bulur. Yalnız profili "rehberde görünür" olan ve
 * etkin işletmeler listelenir; iletişim bilgisi (telefon, e-posta, adres) bu
 * işletmelerin kendi profilinde yayımlamayı seçtikleridir. Okuma sonuçları
 * herkese aynıdır (kendi işletmeniz de görünür; arayüz "siz" diye işaretler),
 * bu yüzden platform önbelleğinde paylaşılır.
 */
@Injectable()
export class DirectoryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly geo: GeoService,
    private readonly machineTypes: MachineTypesService,
  ) {}

  /** İşletme listesi (sayfalı). */
  async shops(q: QueryDirectoryDto): Promise<PaginatedResult<DirectoryShop>> {
    const params: unknown[] = [];
    const add = (v: unknown) => (params.push(v), `$${params.length}`);
    const where = [SHOP_VISIBLE];
    const machineFilter = await this.machineFilter(q, add);

    this.locationWhere(q, where, add, 's');
    if (q.labelIds?.length) {
      where.push(
        `EXISTS (SELECT 1 FROM shop_labels sl JOIN business_labels bl
                   ON bl.id = sl.label_id AND bl.deleted_at IS NULL AND bl.is_active
                  WHERE sl.shop_id = s.id AND sl.label_id = ANY(${add(q.labelIds)}::uuid[]))`,
      );
    }
    if (machineFilter) {
      where.push(`EXISTS (SELECT 1 FROM machines m WHERE m.shop_id = s.id AND ${machineFilter})`);
    }
    for (const w of foldedWords(q.q ?? q.search)) {
      const p = add(`%${w}%`);
      where.push(
        `(${sqlFold('s.name')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('s.legal_name')} LIKE ${p} ESCAPE '\\'
          OR ${sqlFold('s.description')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('s.province')} LIKE ${p} ESCAPE '\\'
          OR ${sqlFold('s.district')} LIKE ${p} ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM shop_labels sl JOIN business_labels bl ON bl.id = sl.label_id AND bl.deleted_at IS NULL
                      WHERE sl.shop_id = s.id AND ${sqlFold('bl.name')} LIKE ${p} ESCAPE '\\'))`,
      );
    }
    const cond = where.join(' AND ');
    const [{ n }]: { n: string }[] = await this.dataSource.query(`SELECT COUNT(*) AS n FROM shops s WHERE ${cond}`, params);

    // Aynı ilçe, sonra aynı il önce gelir (yakındakiler üstte); sonra ada göre.
    const rank: string[] = [];
    if (q.district) rank.push(`(${sqlFold('s.district')} = ${add(foldTr(q.district))}) DESC`);
    if (q.province) rank.push(`(${sqlFold('s.province')} = ${add(foldTr(q.province))}) DESC`);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT s.id, s.name, s.legal_name, s.description, s.province, s.district, s.address_line,
              s.contact_person, s.phone, s.email, s.website, s.created_at
         FROM shops s WHERE ${cond}
        ORDER BY ${[...rank, `${sqlFold('s.name')}`].join(', ')}
        LIMIT ${add(q.limit)} OFFSET ${add(q.skip)}`,
      params,
    );
    const ids = rows.map((r) => String(r.id));
    const [labels, machines] = await Promise.all([this.labelsOf(ids), this.machinesOf(ids, q)]);
    const items = rows.map<DirectoryShop>((r) => ({
      id: String(r.id),
      name: String(r.name),
      legalName: (r.legal_name as string) ?? null,
      description: (r.description as string) ?? null,
      province: (r.province as string) ?? null,
      district: (r.district as string) ?? null,
      addressLine: (r.address_line as string) ?? null,
      contactPerson: (r.contact_person as string) ?? null,
      phone: (r.phone as string) ?? null,
      email: (r.email as string) ?? null,
      website: (r.website as string) ?? null,
      memberSince: new Date(r.created_at as string).toISOString(),
      labels: labels.get(String(r.id)) ?? [],
      machines: machines.get(String(r.id)) ?? [],
    }));
    return buildPaginatedResult(items, Number(n), q.page, q.limit);
  }

  /** "Şu makineye ihtiyacım var": uyan makineler, sahibi işletmeyle birlikte. */
  async machines(q: QueryDirectoryDto): Promise<PaginatedResult<DirectoryMachineHit>> {
    const params: unknown[] = [];
    const add = (v: unknown) => (params.push(v), `$${params.length}`);
    const where = [SHOP_VISIBLE];
    this.locationWhere(q, where, add, 's');
    const machineFilter = await this.machineFilter(q, add);
    where.push(machineFilter ?? this.baseMachine());
    if (q.labelIds?.length) {
      where.push(
        `EXISTS (SELECT 1 FROM shop_labels sl WHERE sl.shop_id = s.id AND sl.label_id = ANY(${add(q.labelIds)}::uuid[]))`,
      );
    }
    for (const w of foldedWords(q.q ?? q.search)) {
      const p = add(`%${w}%`);
      where.push(
        `(${sqlFold('m.name')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('m.brand')} LIKE ${p} ESCAPE '\\'
          OR ${sqlFold('m.model')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('mt.name')} LIKE ${p} ESCAPE '\\'
          OR ${sqlFold('s.name')} LIKE ${p} ESCAPE '\\')`,
      );
    }
    const from = `machines m JOIN shops s ON s.id = m.shop_id LEFT JOIN machine_types mt ON mt.id = m.machine_type_id`;
    const cond = where.join(' AND ');
    const [{ n }]: { n: string }[] = await this.dataSource.query(`SELECT COUNT(*) AS n FROM ${from} WHERE ${cond}`, params);

    const rank: string[] = [];
    if (q.district) rank.push(`(${sqlFold('s.district')} = ${add(foldTr(q.district))}) DESC`);
    if (q.province) rank.push(`(${sqlFold('s.province')} = ${add(foldTr(q.province))}) DESC`);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT m.id, m.name, m.machine_type_id, mt.name AS type_name, m.work_width_mm, m.work_height_mm,
              m.brand, m.model, m.quantity,
              s.id AS shop_id, s.name AS shop_name, s.province, s.district, s.phone, s.email
         FROM ${from} WHERE ${cond}
        ORDER BY ${[...rank, 's.name', 'm.work_width_mm DESC NULLS LAST'].join(', ')}
        LIMIT ${add(q.limit)} OFFSET ${add(q.skip)}`,
      params,
    );
    const tree = await this.machineTypes.memberList();
    const pathOf = new Map(tree.map((t) => [t.id, t.path]));
    const items = rows.map<DirectoryMachineHit>((r) => ({
      id: String(r.id),
      name: String(r.name),
      typeId: (r.machine_type_id as string) ?? null,
      typeName: (r.type_name as string) ?? null,
      typePath: r.machine_type_id ? pathOf.get(String(r.machine_type_id)) ?? null : null,
      widthMm: r.work_width_mm == null ? null : Number(r.work_width_mm),
      heightMm: r.work_height_mm == null ? null : Number(r.work_height_mm),
      brand: (r.brand as string) ?? null,
      model: (r.model as string) ?? null,
      quantity: Number(r.quantity ?? 1),
      matches: true,
      shop: {
        id: String(r.shop_id),
        name: String(r.shop_name),
        province: (r.province as string) ?? null,
        district: (r.district as string) ?? null,
        phone: (r.phone as string) ?? null,
        email: (r.email as string) ?? null,
      },
    }));
    return buildPaginatedResult(items, Number(n), q.page, q.limit);
  }

  /** Süzgeç seçenekleri ve sayıları: il, (seçili ildeki) ilçe, etiket, makine türü. */
  async facets(province?: string): Promise<DirectoryFacets> {
    const [prov, dist, lab, mach] = await Promise.all([
      this.dataSource.query(
        `SELECT s.province AS name, COUNT(*) AS n FROM shops s
          WHERE ${SHOP_VISIBLE} AND s.province IS NOT NULL GROUP BY s.province ORDER BY s.province`,
      ) as Promise<{ name: string; n: string }[]>,
      province
        ? (this.dataSource.query(
            `SELECT s.district AS name, COUNT(*) AS n FROM shops s
              WHERE ${SHOP_VISIBLE} AND ${sqlFold('s.province')} = $1 AND s.district IS NOT NULL
              GROUP BY s.district ORDER BY s.district`,
            [foldTr(province)],
          ) as Promise<{ name: string; n: string }[]>)
        : Promise.resolve([] as { name: string; n: string }[]),
      this.dataSource.query(
        `SELECT bl.id, bl.name, COUNT(DISTINCT s.id) AS n FROM business_labels bl
           LEFT JOIN shop_labels sl ON sl.label_id = bl.id
           LEFT JOIN shops s ON s.id = sl.shop_id AND ${SHOP_VISIBLE}
          WHERE bl.deleted_at IS NULL AND bl.is_active
          GROUP BY bl.id, bl.name, bl.sort_order ORDER BY bl.sort_order, bl.name`,
      ) as Promise<{ id: string; name: string; n: string }[]>,
      this.dataSource.query(
        `SELECT m.machine_type_id AS id, COUNT(DISTINCT s.id) AS n FROM machines m
           JOIN shops s ON s.id = m.shop_id AND ${SHOP_VISIBLE}
          WHERE ${this.baseMachine()} AND m.machine_type_id IS NOT NULL
          GROUP BY m.machine_type_id`,
      ) as Promise<{ id: string; n: string }[]>,
    ]);
    const tree = await this.machineTypes.memberList();
    const direct = new Map(mach.map((r) => [r.id, Number(r.n)]));
    return {
      provinces: prov.map((r) => ({ name: r.name, count: Number(r.n) })),
      districts: dist.map((r) => ({ name: r.name, count: Number(r.n) })),
      labels: lab.map((r) => ({ id: r.id, name: r.name, count: Number(r.n) })),
      machineTypes: tree.map((t) => ({
        id: t.id,
        name: t.name,
        path: t.path,
        // İşletme sayısı alt türleri de kapsar (üst türü seçen alt türdekileri de bulur).
        count: this.subtreeShops(tree, t.id, direct),
      })),
    };
  }

  // ── İç ───────────────────────────────────────────────────────────────

  private subtreeShops(
    tree: { id: string; parentId: string | null }[],
    id: string,
    direct: Map<string, number>,
  ): number {
    // Aynı işletme birden çok alt türde sayılabilir: üst sınır olarak toplam verilir.
    const ids = [id];
    for (let i = 0; i < ids.length; i++) for (const t of tree) if (t.parentId === ids[i]) ids.push(t.id);
    return ids.reduce((s, x) => s + (direct.get(x) ?? 0), 0);
  }

  private baseMachine(): string {
    return `m.deleted_at IS NULL AND m.is_active AND m.is_public`;
  }

  private locationWhere(q: QueryDirectoryDto, where: string[], add: (v: unknown) => string, alias: string): void {
    if (q.province) where.push(`${sqlFold(`${alias}.province`)} = ${add(foldTr(this.geo.canonicalProvince(q.province) ?? q.province))}`);
    if (q.district) where.push(`${sqlFold(`${alias}.district`)} = ${add(foldTr(q.district))}`);
  }

  /** Makine süzgeci (tür + ebat) varsa `machines m` için koşul; yoksa null. */
  private async machineFilter(q: QueryDirectoryDto, add: (v: unknown) => string): Promise<string | null> {
    const hasSize = q.minWidthMm !== undefined || q.minHeightMm !== undefined;
    if (!q.machineTypeId && !hasSize) return null;
    const conds = [this.baseMachine()];
    if (q.machineTypeId) {
      const ids = await this.machineTypes.descendantsOf(q.machineTypeId);
      conds.push(`m.machine_type_id = ANY(${add(ids)}::uuid[])`);
    }
    if (hasSize) {
      const w = add(q.minWidthMm ?? 0);
      const h = add(q.minHeightMm ?? 0);
      // Ebat, makine ters çevrilerek de sığabilir.
      conds.push(
        `m.work_width_mm IS NOT NULL AND m.work_height_mm IS NOT NULL AND
         ((m.work_width_mm >= ${w} AND m.work_height_mm >= ${h}) OR (m.work_width_mm >= ${h} AND m.work_height_mm >= ${w}))`,
      );
    }
    return conds.join(' AND ');
  }

  private async labelsOf(shopIds: string[]): Promise<Map<string, { id: string; name: string }[]>> {
    const out = new Map<string, { id: string; name: string }[]>();
    if (!shopIds.length) return out;
    const rows: { shop_id: string; id: string; name: string }[] = await this.dataSource.query(
      `SELECT sl.shop_id, bl.id, bl.name FROM shop_labels sl
         JOIN business_labels bl ON bl.id = sl.label_id AND bl.deleted_at IS NULL AND bl.is_active
        WHERE sl.shop_id = ANY($1) ORDER BY bl.sort_order, bl.name`,
      [shopIds],
    );
    for (const r of rows) out.set(r.shop_id, [...(out.get(r.shop_id) ?? []), { id: r.id, name: r.name }]);
    return out;
  }

  private async machinesOf(shopIds: string[], q: QueryDirectoryDto): Promise<Map<string, DirectoryMachine[]>> {
    const out = new Map<string, DirectoryMachine[]>();
    if (!shopIds.length) return out;
    const params: unknown[] = [shopIds];
    const add = (v: unknown) => (params.push(v), `$${params.length}`);
    const filter = await this.machineFilter(q, add);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT m.id, m.shop_id, m.name, m.machine_type_id, mt.name AS type_name, m.work_width_mm, m.work_height_mm,
              m.brand, m.model, m.quantity,
              ${filter ? `(${filter})` : 'false'} AS matches
         FROM machines m LEFT JOIN machine_types mt ON mt.id = m.machine_type_id
        WHERE m.shop_id = ANY($1) AND ${this.baseMachine()}
        ORDER BY matches DESC, mt.name NULLS LAST, m.work_width_mm DESC NULLS LAST, m.name`,
      params,
    );
    const tree = await this.machineTypes.memberList();
    const pathOf = new Map(tree.map((t) => [t.id, t.path]));
    for (const r of rows) {
      const list = out.get(String(r.shop_id)) ?? [];
      if (list.length >= 40) continue;
      list.push({
        id: String(r.id),
        name: String(r.name),
        typeId: (r.machine_type_id as string) ?? null,
        typeName: (r.type_name as string) ?? null,
        typePath: r.machine_type_id ? pathOf.get(String(r.machine_type_id)) ?? null : null,
        widthMm: r.work_width_mm == null ? null : Number(r.work_width_mm),
        heightMm: r.work_height_mm == null ? null : Number(r.work_height_mm),
        brand: (r.brand as string) ?? null,
        model: (r.model as string) ?? null,
        quantity: Number(r.quantity ?? 1),
        matches: Boolean(r.matches),
      });
      out.set(String(r.shop_id), list);
    }
    return out;
  }
}

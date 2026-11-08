import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { buildPaginatedResult, PaginatedResult } from '../../common/dto/paginated-result';
import { foldedWords, foldTr, sqlFold } from '../../common/utils/search.util';
import { defaultFeatures, mergeFeatures, resolveFeatures, ShopFeature, ShopFeatures } from '../../common/shop/shop-features';
import { Shop } from '../shops/entities/shop.entity';
import { PlatformSettingsService } from './platform-settings.service';
import { QueryBusinessesDto, UpdateBusinessAdminDto } from './dto/platform.dto';

export interface BusinessRow {
  id: string;
  name: string;
  status: string;
  isActive: boolean;
  plan: string;
  subscriptionUntil: string | null;
  /** Kiralama bitişine kalan gün (negatif: geçmiş); süresizse null. */
  daysLeft: number | null;
  province: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
  directoryVisible: boolean;
  createdAt: string;
  memberCount: number;
  machineCount: number;
  labels: string[];
  /** İş kolu etiketlerinin kimlikleri (süzgeç çipleri için). */
  labelIds: string[];
  /** Sistem sahibinin bu işletmeye açtığı özellikler. */
  features: ShopFeatures;
  adminNote: string | null;
  /** Yöneticiler (hesap sahibi): ad, e-posta, telefon. */
  admins: { fullName: string; email: string; phone: string | null }[];
}

export interface PlatformStats {
  total: number;
  pending: number;
  active: number;
  suspended: number;
  expiringSoon: number;
  expired: number;
  visibleInDirectory: number;
}

const DAY = 86_400_000;
/** Özelliğin varsayılanı açık mı? (süzgeçte yazılmamış değer buna göre sayılır) */
const defaultsOn = (feature: ShopFeature): boolean => defaultFeatures()[feature];
const today = () => new Date().toISOString().slice(0, 10);

/** Platform yöneticisi: kiralanan işletmeler — onay, askıya alma, kiralama süresi, notlar. */
@Injectable()
export class BusinessesService {
  constructor(
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settings: PlatformSettingsService,
  ) {}

  /** Onaylar: etkin yapar; kiralama bitişi yoksa deneme süresi kadar verir. */
  async approve(id: string): Promise<BusinessRow> {
    const shop = await this.shops.findOne({ where: { id } });
    if (!shop) throw new NotFoundException('İşletme bulunamadı.');
    shop.status = 'active';
    shop.isActive = true;
    if (!shop.subscriptionUntil) {
      const { trialDays } = await this.settings.get();
      if (trialDays > 0) {
        shop.subscriptionUntil = new Date(Date.now() + trialDays * DAY).toISOString().slice(0, 10);
        shop.plan = shop.plan === 'standard' ? 'deneme' : shop.plan;
      }
    }
    await this.shops.save(shop);
    return this.get(id);
  }

  async stats(): Promise<PlatformStats> {
    const [r]: Record<string, string>[] = await this.dataSource.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'pending') AS pending,
              COUNT(*) FILTER (WHERE status = 'active') AS active,
              COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
              COUNT(*) FILTER (WHERE status = 'active' AND subscription_until IS NOT NULL
                               AND subscription_until >= CURRENT_DATE AND subscription_until <= CURRENT_DATE + 7) AS expiring,
              COUNT(*) FILTER (WHERE status = 'active' AND subscription_until IS NOT NULL
                               AND subscription_until < CURRENT_DATE) AS expired,
              COUNT(*) FILTER (WHERE directory_visible AND status = 'active') AS visible
         FROM shops WHERE deleted_at IS NULL`,
    );
    return {
      total: Number(r.total),
      pending: Number(r.pending),
      active: Number(r.active),
      suspended: Number(r.suspended),
      expiringSoon: Number(r.expiring),
      expired: Number(r.expired),
      visibleInDirectory: Number(r.visible),
    };
  }

  async list(q: QueryBusinessesDto): Promise<PaginatedResult<BusinessRow>> {
    const where: string[] = ['s.deleted_at IS NULL'];
    const params: unknown[] = [];
    const add = (v: unknown) => (params.push(v), `$${params.length}`);
    if (q.status) where.push(`s.status = ${add(q.status)}`);
    if (q.province) where.push(`${sqlFold('s.province')} = ${add(foldTr(q.province))}`);
    if (q.district) where.push(`${sqlFold('s.district')} = ${add(foldTr(q.district))}`);
    if (q.expiring) where.push(`s.subscription_until IS NOT NULL AND s.subscription_until <= CURRENT_DATE + 7`);
    if (q.labelId) {
      where.push(
        `EXISTS (SELECT 1 FROM shop_labels sl WHERE sl.shop_id = s.id AND sl.label_id = ${add(q.labelId)}::uuid)`,
      );
    }
    if (q.feature) {
      // Yazılmamış özellik varsayılanına düşer: açık olanlar = yazılı true ya da varsayılanı açık ve false yazılmamış.
      const def = defaultsOn(q.feature);
      where.push(
        def
          ? `COALESCE((s.features ->> ${add(q.feature)})::boolean, true) = true`
          : `COALESCE((s.features ->> ${add(q.feature)})::boolean, false) = true`,
      );
    }
    for (const w of foldedWords(q.search)) {
      const p = add(`%${w}%`);
      where.push(
        `(${sqlFold('s.name')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('s.legal_name')} LIKE ${p} ESCAPE '\\'
          OR ${sqlFold('s.email')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('s.phone')} LIKE ${p} ESCAPE '\\'
          OR ${sqlFold('s.province')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('s.district')} LIKE ${p} ESCAPE '\\')`,
      );
    }
    const cond = where.join(' AND ');
    const [{ n }]: { n: string }[] = await this.dataSource.query(`SELECT COUNT(*) AS n FROM shops s WHERE ${cond}`, params);
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT s.* FROM shops s WHERE ${cond}
        ORDER BY (s.status = 'pending') DESC, s.created_at DESC
        LIMIT ${add(q.limit)} OFFSET ${add(q.skip)}`,
      params,
    );
    const items = await this.decorate(rows.map((r) => String(r.id)));
    return buildPaginatedResult(items, Number(n), q.page, q.limit);
  }

  async get(id: string): Promise<BusinessRow> {
    const [row] = await this.decorate([id]);
    if (!row) throw new NotFoundException('İşletme bulunamadı.');
    return row;
  }

  async update(id: string, dto: UpdateBusinessAdminDto): Promise<BusinessRow> {
    const shop = await this.shops.findOne({ where: { id } });
    if (!shop) throw new NotFoundException('İşletme bulunamadı.');
    if (dto.status !== undefined) shop.status = dto.status;
    if (dto.plan !== undefined) shop.plan = dto.plan || 'standard';
    if (dto.subscriptionUntil !== undefined) {
      if (dto.subscriptionUntil && Number.isNaN(Date.parse(dto.subscriptionUntil))) {
        throw new BadRequestException('Geçersiz tarih.');
      }
      shop.subscriptionUntil = dto.subscriptionUntil;
    }
    if (dto.extendDays !== undefined) {
      const base = shop.subscriptionUntil && shop.subscriptionUntil >= today() ? shop.subscriptionUntil : today();
      shop.subscriptionUntil = new Date(Date.parse(base) + dto.extendDays * DAY).toISOString().slice(0, 10);
    }
    if (dto.adminNote !== undefined) shop.adminNote = dto.adminNote?.trim() || null;
    if (dto.isActive !== undefined) shop.isActive = dto.isActive;
    if (dto.directoryVisible !== undefined) shop.directoryVisible = dto.directoryVisible;
    if (dto.features !== undefined) shop.features = mergeFeatures(shop.features, dto.features);
    await this.shops.save(shop);
    return this.get(id);
  }

  private async decorate(ids: string[]): Promise<BusinessRow[]> {
    if (!ids.length) return [];
    const [shops, members, machines, labels, admins] = await Promise.all([
      this.dataSource.query(`SELECT *, subscription_until::text AS subscription_until_text FROM shops WHERE id = ANY($1)`, [ids]) as Promise<Record<string, unknown>[]>,
      this.dataSource.query(
        `SELECT shop_id, COUNT(*) AS n FROM shop_members WHERE shop_id = ANY($1) GROUP BY shop_id`,
        [ids],
      ) as Promise<{ shop_id: string; n: string }[]>,
      this.dataSource.query(
        `SELECT shop_id, COUNT(*) AS n FROM machines WHERE shop_id = ANY($1) AND deleted_at IS NULL GROUP BY shop_id`,
        [ids],
      ) as Promise<{ shop_id: string; n: string }[]>,
      this.dataSource.query(
        `SELECT sl.shop_id, bl.id, bl.name FROM shop_labels sl
           JOIN business_labels bl ON bl.id = sl.label_id AND bl.deleted_at IS NULL
          WHERE sl.shop_id = ANY($1) ORDER BY bl.sort_order, bl.name`,
        [ids],
      ) as Promise<{ shop_id: string; id: string; name: string }[]>,
      this.dataSource.query(
        `SELECT m.shop_id, u.full_name, u.email, u.phone FROM shop_members m
           JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
          WHERE m.shop_id = ANY($1) AND m.is_admin ORDER BY u.full_name`,
        [ids],
      ) as Promise<{ shop_id: string; full_name: string; email: string; phone: string | null }[]>,
    ]);
    const group = <T extends { shop_id: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r.shop_id, [...(m.get(r.shop_id) ?? []), r]);
      return m;
    };
    const mem = new Map(members.map((r) => [r.shop_id, Number(r.n)]));
    const mac = new Map(machines.map((r) => [r.shop_id, Number(r.n)]));
    const lab = group(labels);
    const adm = group(admins);
    const byId = new Map(shops.map((s) => [String(s.id), s]));
    const now = Date.parse(today());
    return ids
      .map((id) => byId.get(id))
      .filter((s): s is Record<string, unknown> => !!s)
      .map((s) => {
        const until = s.subscription_until_text ? String(s.subscription_until_text).slice(0, 10) : null;
        return {
          id: String(s.id),
          name: String(s.name),
          status: String(s.status),
          isActive: Boolean(s.is_active),
          plan: String(s.plan),
          subscriptionUntil: until,
          daysLeft: until ? Math.round((Date.parse(until) - now) / DAY) : null,
          province: (s.province as string) ?? null,
          district: (s.district as string) ?? null,
          phone: (s.phone as string) ?? null,
          email: (s.email as string) ?? null,
          directoryVisible: Boolean(s.directory_visible),
          createdAt: new Date(s.created_at as string).toISOString(),
          memberCount: mem.get(String(s.id)) ?? 0,
          machineCount: mac.get(String(s.id)) ?? 0,
          labels: (lab.get(String(s.id)) ?? []).map((l) => l.name),
          labelIds: (lab.get(String(s.id)) ?? []).map((l) => l.id),
          features: resolveFeatures(s.features),
          adminNote: (s.admin_note as string) ?? null,
          admins: (adm.get(String(s.id)) ?? []).map((a) => ({ fullName: a.full_name, email: a.email, phone: a.phone })),
        };
      });
  }
}


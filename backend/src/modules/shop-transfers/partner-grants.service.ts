import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ShopContext } from '../../common/shop/shop-context';
import { foldedWords, sqlFold } from '../../common/utils/search.util';
import { ShopAccessInfo } from '../shops/shop-access.service';
import {
  grantActive,
  PARTNER_PERMISSIONS,
  PartnerPermission,
  ShopPartnerGrant,
} from './entities/shop-partner-grant.entity';

/** Arayüze dönen yetki satırı: karşı işletmenin yalnız adı/yeri. */
export interface GrantView {
  id: string;
  permission: PartnerPermission;
  /** Verilen yetkide: yetkiyi alan; alınan yetkide: yetkiyi veren. */
  shop: { id: string; name: string; province: string | null; district: string | null };
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface PartnerCandidate {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  /** Kullanıcının kendi (başka) dükkânı. */
  own: boolean;
}

const MAX_YEARS = 5;

/**
 * İşletmeler arası yetkiler: "şu işletme bana yönelttiği işlemleri otomatik onayla",
 * "şu işletme paylaşılan stoğumu görebilir", "şu işletmeyi engelle" — her biri belirli bir
 * süreyle ya da süresiz. Yalnız VEREN işletmenin yöneticisi yazar; alan işletme kendisine
 * tanınanı salt okunur görür. Süresi dolan yetki geçersizdir (okuma anında hesaplanır).
 */
@Injectable()
export class PartnerGrantsService {
  constructor(
    @InjectRepository(ShopPartnerGrant) private readonly grants: Repository<ShopPartnerGrant>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ── Okuma (ticaret kuralları da kullanır) ──────────────────────────

  /** `grantor`un `grantee`ye verdiği, şu an geçerli yetki (yoksa null). */
  async active(grantorShopId: string, granteeShopId: string, permission: PartnerPermission): Promise<ShopPartnerGrant | null> {
    const g = await this.grants.findOne({ where: { grantorShopId, granteeShopId, permission } });
    return g && grantActive(g) ? g : null;
  }

  /** `grantor`, `grantee`yi engellemiş mi? */
  async isBlocked(grantorShopId: string, granteeShopId: string): Promise<boolean> {
    return !!(await this.active(grantorShopId, granteeShopId, 'block'));
  }

  async list(shopId: string): Promise<{ given: GrantView[]; received: GrantView[] }> {
    const rows = await this.grants
      .createQueryBuilder('g')
      .where('g.grantor_shop_id = :shopId OR g.grantee_shop_id = :shopId', { shopId })
      .orderBy('g.createdAt', 'DESC')
      .getMany();
    const live = rows.filter((g) => grantActive(g));
    const ids = [...new Set(live.flatMap((g) => [g.grantorShopId, g.granteeShopId]))];
    const shops = await this.shopsByIds(ids);
    const view = (g: ShopPartnerGrant, otherId: string): GrantView | null => {
      const shop = shops.get(otherId);
      if (!shop) return null;
      return {
        id: g.id,
        permission: g.permission,
        shop,
        expiresAt: g.expiresAt ? new Date(g.expiresAt).toISOString() : null,
        note: g.note ?? null,
        createdAt: new Date(g.createdAt).toISOString(),
      };
    };
    const given = live.filter((g) => g.grantorShopId === shopId).map((g) => view(g, g.granteeShopId));
    // Engel, engellenene bildirilmez: "alınan" listede görünmez.
    const received = live
      .filter((g) => g.granteeShopId === shopId && g.permission !== 'block')
      .map((g) => view(g, g.grantorShopId));
    return {
      given: given.filter((v): v is GrantView => !!v),
      received: received.filter((v): v is GrantView => !!v),
    };
  }

  // ── Yazma (yalnız yönetici) ────────────────────────────────────────

  async upsert(
    info: ShopAccessInfo,
    input: { granteeShopId: string; permission: PartnerPermission; expiresAt?: string | null; note?: string | null },
    actorId: string,
  ): Promise<GrantView> {
    this.assertAdmin(info);
    if (!PARTNER_PERMISSIONS.includes(input.permission)) throw new BadRequestException('Geçersiz yetki türü.');
    if (input.granteeShopId === info.shopId) throw new BadRequestException('Kendi işletmenize yetki veremezsiniz.');
    const exists = await this.shopsByIds([input.granteeShopId]);
    if (!exists.has(input.granteeShopId)) throw new NotFoundException('İşletme bulunamadı.');

    let expiresAt: Date | null = null;
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt);
      const now = Date.now();
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) {
        throw new BadRequestException('Bitiş zamanı gelecekte olmalı.');
      }
      if (expiresAt.getTime() > now + MAX_YEARS * 366 * 86_400_000) {
        throw new BadRequestException(`Süre en çok ${MAX_YEARS} yıl olabilir; süresiz için bitiş vermeyin.`);
      }
    }

    // Engel varken başka yetki verilmez; engel konurken diğerleri kalkar.
    const existing = await this.grants.find({
      where: { grantorShopId: info.shopId, granteeShopId: input.granteeShopId },
      withDeleted: true,
    });
    const blocked = existing.some((g) => g.permission === 'block' && grantActive(g));
    if (input.permission !== 'block' && blocked) {
      throw new ConflictException('Bu işletme engelli; önce engeli kaldırın.');
    }
    if (input.permission === 'block') {
      for (const g of existing) {
        if (g.permission !== 'block' && !g.deletedAt) await this.grants.softDelete(g.id);
      }
    }

    const row = existing.find((g) => g.permission === input.permission);
    let saved: ShopPartnerGrant;
    if (row) {
      row.deletedAt = null;
      row.expiresAt = expiresAt;
      row.note = input.note?.trim() || null;
      row.createdById = actorId;
      saved = await this.grants.save(row);
    } else {
      saved = await this.grants.save(
        this.grants.create({
          grantorShopId: info.shopId,
          granteeShopId: input.granteeShopId,
          permission: input.permission,
          expiresAt,
          note: input.note?.trim() || null,
          createdById: actorId,
        }),
      );
    }
    const shop = (await this.shopsByIds([input.granteeShopId])).get(input.granteeShopId)!;
    return {
      id: saved.id,
      permission: saved.permission,
      shop,
      expiresAt: saved.expiresAt ? new Date(saved.expiresAt).toISOString() : null,
      note: saved.note ?? null,
      createdAt: new Date(saved.createdAt).toISOString(),
    };
  }

  async remove(info: ShopAccessInfo, id: string): Promise<void> {
    this.assertAdmin(info);
    const g = await this.grants.findOne({ where: { id } });
    // Başkasının verdiği yetkiyi silemez; varlığı da belli edilmez.
    if (!g || g.grantorShopId !== info.shopId) throw new NotFoundException('Yetki bulunamadı.');
    await this.grants.softDelete(g.id);
  }

  // ── Ortak arama ────────────────────────────────────────────────────

  /**
   * İşlem yapılabilecek işletmeler: kullanıcının kendi diğer dükkânları, rehberde
   * görünenler ve daha önce yetki/işlem ilişkisi olduklarım. Rehberde görünmeyen bir
   * işletme bulunamaz (gizliliği); kendisini engelleyen ya da ticareti kapalı olanlar çıkmaz.
   */
  async search(info: ShopAccessInfo, ownShopIds: string[], q?: string): Promise<PartnerCandidate[]> {
    const params: unknown[] = [info.shopId, ownShopIds];
    const add = (v: unknown) => (params.push(v), `$${params.length}`);
    const where = [
      `s.deleted_at IS NULL AND s.is_active AND s.status = 'active'`,
      `COALESCE((s.features ->> 'trade')::boolean, true)`,
      `s.id <> $1`,
      // Beni engelleyen işletme beni göremez.
      `NOT EXISTS (SELECT 1 FROM shop_partner_grants b WHERE b.grantor_shop_id = s.id AND b.grantee_shop_id = $1
                     AND b.permission = 'block' AND b.deleted_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now()))`,
      `(s.directory_visible OR s.id = ANY($2::uuid[])
         OR EXISTS (SELECT 1 FROM shop_partner_grants g WHERE g.deleted_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > now())
                      AND ((g.grantor_shop_id = s.id AND g.grantee_shop_id = $1) OR (g.grantee_shop_id = s.id AND g.grantor_shop_id = $1)))
         OR EXISTS (SELECT 1 FROM shop_transfers t WHERE (t.from_shop_id = s.id AND t.to_shop_id = $1) OR (t.to_shop_id = s.id AND t.from_shop_id = $1)))`,
    ];
    for (const w of foldedWords(q)) {
      const p = add(`%${w}%`);
      where.push(`(${sqlFold('s.name')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('s.province')} LIKE ${p} ESCAPE '\\' OR ${sqlFold('s.district')} LIKE ${p} ESCAPE '\\')`);
    }
    const rows: { id: string; name: string; province: string | null; district: string | null }[] = await this.dataSource.query(
      `SELECT s.id, s.name, s.province, s.district FROM shops s WHERE ${where.join(' AND ')} ORDER BY s.name LIMIT 25`,
      params,
    );
    const own = new Set(ownShopIds);
    return rows.map((r) => ({ ...r, own: own.has(r.id) }));
  }

  // ── İç ─────────────────────────────────────────────────────────────

  private assertAdmin(info: ShopAccessInfo): void {
    if (!info.isAdmin && !info.isOwner) {
      throw new ForbiddenException('İşletmeler arası yetkileri yalnız işletme yöneticisi değiştirebilir.');
    }
  }

  private async shopsByIds(
    ids: string[],
  ): Promise<Map<string, { id: string; name: string; province: string | null; district: string | null }>> {
    if (!ids.length) return new Map();
    const rows: { id: string; name: string; province: string | null; district: string | null }[] =
      await ShopContext.unscoped(() =>
        this.dataSource.query(
          `SELECT id, name, province, district FROM shops
            WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND is_active AND status = 'active'`,
          [ids],
        ),
      );
    return new Map(rows.map((r) => [r.id, r]));
  }
}

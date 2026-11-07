import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { ShopContext } from '../../common/shop/shop-context';
import {
  fullPermissions,
  normalizePermissions,
  ShopPermissions,
} from '../../common/shop/shop-permissions';
import { CacheGroup, GLOBAL_SCOPE } from '../../common/cache/cache.groups';
import { CacheService } from '../../common/cache/cache.service';
import { ShopMember } from './entities/shop-member.entity';
import { Shop, ShopStatus } from './entities/shop.entity';

/** Bir kullanıcının bir dükkândaki çözülmüş erişimi. */
export interface ShopAccessInfo {
  shopId: string;
  shopName: string;
  shopActive: boolean;
  /** Hesap durumu (kiralama): yalnız 'active' hesaba girilir (sistem sahibi hariç). */
  status: ShopStatus;
  /** Kiralamanın son günü (YYYY-AA-GG) ya da süresiz (null). */
  subscriptionUntil: string | null;
  /** Kiralama süresi dolmuş: veriler görülür, yazılamaz. İstek anında hesaplanır. */
  expired: boolean;
  /** Sistem sahibi: her dükkânda her şeye erişir. */
  isOwner: boolean;
  isAdmin: boolean;
  permissions: ShopPermissions;
}

/** Kiralama bitiş günü (dahil) geçti mi? Boş = süresiz. */
export function isExpired(until: string | null | undefined, now: Date = new Date()): boolean {
  if (!until) return false;
  return now.toISOString().slice(0, 10) > String(until).slice(0, 10);
}

/** Oturumdaki kullanıcı için asgari kimlik. */
export interface ShopActor {
  id: string;
  role: string;
}

/** Arayüze dönen dükkân listesi satırı. */
export interface ShopSummary {
  id: string;
  name: string;
  isActive: boolean;
  status: ShopStatus;
  plan: string;
  subscriptionUntil: string | null;
  expired: boolean;
  isAdmin: boolean;
  permissions: ShopPermissions;
}

/**
 * Kim hangi dükkâna, hangi izinle girebilir? Her istekte guard tarafından
 * çağrılır; izin değişikliği bir sonraki istekte geçerli olur (oturumu
 * yenilemek gerekmez).
 */
@Injectable()
export class ShopAccessService {
  private readonly logger = new Logger(ShopAccessService.name);

  constructor(
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(ShopMember) private readonly members: Repository<ShopMember>,
    private readonly cache: CacheService,
  ) {}

  static isOwner(actor: ShopActor): boolean {
    return actor.role === UserRole.OWNER;
  }

  /**
   * Her istekte çağrılır (guard). Sonuç önbelleğe alınır; dükkân ya da üyelik
   * kaydına yazılınca ('access' grubu) kendiliğinden silinir → izin değişikliği
   * yine bir sonraki istekte geçerli olur. Hatalar (yetkisiz) saklanmaz.
   */
  async resolve(actor: ShopActor, shopId: string): Promise<ShopAccessInfo> {
    if (!ShopContext.isUuid(shopId)) {
      throw new BadRequestException('Geçersiz dükkân seçimi.');
    }
    const info = await this.cache.wrap(
      GLOBAL_SCOPE,
      CacheGroup.ACCESS,
      `resolve:${actor.role}:${actor.id}:${shopId}`,
      300,
      () => this.resolveUncached(actor, shopId),
    );
    // "Süresi doldu mu" günün saatine bağlıdır: önbellekte değil, her istekte hesaplanır.
    return { ...info, expired: isExpired(info.subscriptionUntil) };
  }

  private async resolveUncached(actor: ShopActor, shopId: string): Promise<ShopAccessInfo> {
    const shop = await this.shops.findOne({ where: { id: shopId } });
    if (!shop) throw new ForbiddenException('Dükkân bulunamadı.');

    if (ShopAccessService.isOwner(actor)) {
      return this.info(shop, true, true, fullPermissions());
    }
    if (!shop.isActive) throw new ForbiddenException('Bu dükkân kapatılmış.');
    if (shop.status === 'pending') {
      throw new ForbiddenException('Kaydınız yönetici onayı bekliyor. Onaylandığında giriş yapabilirsiniz.');
    }
    if (shop.status === 'suspended') {
      throw new ForbiddenException('Hesabınız askıya alınmış. Lütfen yönetici ile iletişime geçin.');
    }
    const member = await this.members.findOne({ where: { shopId, userId: actor.id } });
    if (!member) throw new ForbiddenException('Bu dükkâna erişiminiz yok.');
    return this.info(shop, false, member.isAdmin, normalizePermissions(member.permissions));
  }

  /** Kullanıcının girebildiği dükkânlar (sistem sahibi: hepsi). */
  async listFor(actor: ShopActor): Promise<ShopSummary[]> {
    if (ShopAccessService.isOwner(actor)) {
      const all = await this.shops.find({ order: { createdAt: 'ASC' } });
      return all.map((s) => ({
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        status: s.status,
        plan: s.plan,
        subscriptionUntil: s.subscriptionUntil ?? null,
        expired: isExpired(s.subscriptionUntil),
        isAdmin: true,
        permissions: fullPermissions(),
      }));
    }
    const rows = await this.members.find({
      where: { userId: actor.id },
      relations: { shop: true },
    });
    return rows
      .filter((m) => m.shop && m.shop.isActive && !m.shop.deletedAt)
      .sort((a, b) => a.shop!.createdAt.getTime() - b.shop!.createdAt.getTime())
      .map((m) => ({
        id: m.shopId,
        name: m.shop!.name,
        isActive: m.shop!.isActive,
        status: m.shop!.status,
        plan: m.shop!.plan,
        subscriptionUntil: m.shop!.subscriptionUntil ?? null,
        expired: isExpired(m.shop!.subscriptionUntil),
        isAdmin: m.isAdmin,
        permissions: normalizePermissions(m.permissions),
      }));
  }

  /**
   * İstekte dükkân seçilmemişse: kullanıcının tek dükkânı varsa o, yoksa
   * seçim istenir. (Eski istemciler ve tek dükkânlı kurulumlar için.)
   */
  async implicitShopId(actor: ShopActor): Promise<string> {
    const shops = (await this.listFor(actor)).filter((s) => s.isActive);
    if (shops.length === 1) return shops[0].id;
    if (!shops.length) throw new ForbiddenException('Hiçbir dükkâna erişiminiz yok.');
    throw new BadRequestException('Dükkân seçilmedi (X-Shop-Id başlığı).');
  }

  /** Açık dükkânlar, açılış sırasıyla. */
  activeShops(): Promise<Shop[]> {
    return this.shops.find({ where: { isActive: true }, order: { createdAt: 'ASC' } });
  }

  /**
   * Zamanlanmış görevler için: `fn`'i her açık dükkânda, o dükkânın
   * bağlamında sırayla çalıştırır. Bir dükkândaki hata diğerlerini durdurmaz.
   */
  async forEachShop(label: string, fn: (shop: Shop) => Promise<void>): Promise<void> {
    for (const shop of await this.activeShops()) {
      try {
        await ShopContext.forShop(shop.id, () => fn(shop));
      } catch (err) {
        this.logger.warn(`${label} "${shop.name}" dükkânında başarısız: ${(err as Error).message}`);
      }
    }
  }

  private info(
    shop: Shop,
    isOwner: boolean,
    isAdmin: boolean,
    permissions: ShopPermissions,
  ): ShopAccessInfo {
    return {
      shopId: shop.id,
      shopName: shop.name,
      shopActive: shop.isActive,
      status: shop.status,
      subscriptionUntil: shop.subscriptionUntil ?? null,
      expired: false,
      isOwner,
      isAdmin,
      permissions,
    };
  }
}

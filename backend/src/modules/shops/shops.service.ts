import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, In, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { ShopContext } from '../../common/shop/shop-context';
import {
  excessPermissions,
  isSubset,
  normalizePermissions,
  ShopPermissions,
} from '../../common/shop/shop-permissions';
import { seedShopDefaults } from '../../database/seed';
import { User } from '../users/entities/user.entity';
import {
  AddMemberDto,
  CreateShopDto,
  UpdateMemberAccountDto,
  UpdateMemberDto,
  UpdateShopDto,
} from './dto/shop.dto';
import { ShopMember } from './entities/shop-member.entity';
import { Shop } from './entities/shop.entity';
import { copyShopCatalog, copyShopSettings } from './shop-copy';
import { ShopAccessInfo, ShopAccessService, ShopActor } from './shop-access.service';

/** Ekip ekranındaki bir üye satırı. */
export interface MemberView {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
  permissions: ShopPermissions;
  /** Kullanıcının üye olduğu başka dükkân sayısı (hesap düzenleme kuralı için). */
  otherShops: number;
  /** Oturumdaki kullanıcı bu üyeyi düzenleyebilir mi? */
  editable: boolean;
}

/** Formlarda seçilen personel (ödemeyi teslim alan vb.). */
export interface StaffView {
  id: string;
  fullName: string;
}

const SALT_ROUNDS = 10;

/**
 * Dükkânlar ve ekipleri.
 *
 * Sistem sahibi (OWNER): dükkân açar/kapatır, her dükkânın ekibini ve
 * herkesin izinlerini düzenler.
 *
 * Dükkân yöneticisi: yalnız yöneticisi olduğu dükkânın ekibini düzenler ve
 * şu kurallarla sınırlıdır:
 *  - kendi üyeliğini değiştiremez (kendine yetki veremez),
 *  - kendinde olmayan bir izni kimseye veremez,
 *  - izinleri kendisininkini aşan birini (ör. daha yetkili bir yöneticiyi)
 *    düzenleyemez ya da çıkaramaz,
 *  - sistem sahibine dokunamaz.
 */
@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(ShopMember) private readonly members: Repository<ShopMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: ShopAccessService,
  ) {}

  // ── Dükkânlar ───────────────────────────────────────────────────────

  /** Ekip ekranı: sistem sahibine hepsi, yöneticiye yönettikleri. */
  async manageable(actor: ShopActor): Promise<(Shop & { memberCount: number })[]> {
    const list = ShopAccessService.isOwner(actor)
      ? await this.shops.find({ order: { createdAt: 'ASC' } })
      : await this.adminShops(actor);
    const counts: { shop_id: string; n: string }[] = list.length
      ? await this.dataSource.query(
          `SELECT "shop_id", COUNT(*) AS n FROM "shop_members" WHERE "shop_id" = ANY($1) GROUP BY "shop_id"`,
          [list.map((s) => s.id)],
        )
      : [];
    const byShop = new Map(counts.map((c) => [c.shop_id, Number(c.n)]));
    return list.map((s) => Object.assign(s, { memberCount: byShop.get(s.id) ?? 0 }));
  }

  async create(dto: CreateShopDto): Promise<Shop> {
    const name = dto.name.trim();
    let source: Shop | null = null;
    if (dto.copyFromShopId) {
      source = await this.shops.findOne({ where: { id: dto.copyFromShopId } });
      if (!source) throw new NotFoundException('Kopyalanacak dükkân bulunamadı.');
    }
    const shop = await this.shops.save(this.shops.create({ name, isActive: true }));

    if (source && dto.copyCatalog) {
      await copyShopCatalog(this.dataSource, source.id, shop.id);
    }
    if (source && dto.copySettings) {
      await copyShopSettings(this.dataSource, source.id, shop.id, name);
    }
    // Kopyalanmayan her şey için varsayılanlar (depo, tarifeler, türler).
    await ShopContext.forShop(shop.id, () => seedShopDefaults(this.dataSource, { businessName: name }));
    return shop;
  }

  async update(id: string, dto: UpdateShopDto): Promise<Shop> {
    const shop = await this.shops.findOne({ where: { id } });
    if (!shop) throw new NotFoundException('Dükkân bulunamadı.');
    if (dto.name !== undefined) shop.name = dto.name.trim();
    if (dto.isActive !== undefined) {
      if (!dto.isActive) {
        const open = await this.shops.count({ where: { isActive: true } });
        if (shop.isActive && open <= 1) {
          throw new BadRequestException('Son açık dükkân kapatılamaz.');
        }
      }
      shop.isActive = dto.isActive;
    }
    return this.shops.save(shop);
  }

  // ── Ekip ────────────────────────────────────────────────────────────

  async listMembers(actor: ShopActor, shopId: string): Promise<MemberView[]> {
    const mine = await this.requireManager(actor, shopId);
    const rows = await this.members.find({
      where: { shopId },
      relations: { user: true },
    });
    const live = rows.filter((m) => m.user && !m.user.deletedAt);
    const others = await this.otherShopCounts(live.map((m) => m.userId), shopId);
    return live
      .map((m) => this.view(m, others.get(m.userId) ?? 0, this.canEdit(actor, mine, m)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
  }

  async addMember(actor: ShopActor, shopId: string, dto: AddMemberDto): Promise<MemberView> {
    const mine = await this.requireManager(actor, shopId);
    const permissions = normalizePermissions(dto.permissions ?? {});
    this.assertCanGrant(mine, permissions);

    let user: User | null = null;
    if (dto.newUser) {
      const email = dto.newUser.email.trim();
      if (await this.users.findOne({ where: { email }, withDeleted: true })) {
        throw new ConflictException('Bu e-posta zaten kayıtlı; kullanıcıyı e-postasıyla ekleyin.');
      }
      user = await this.users.save(
        this.users.create({
          fullName: dto.newUser.fullName.trim(),
          email,
          phone: dto.newUser.phone?.trim() || undefined,
          role: UserRole.EMPLOYEE,
          isActive: true,
          passwordHash: await bcrypt.hash(dto.newUser.password, SALT_ROUNDS),
        }),
      );
    } else if (dto.userId) {
      // Kullanıcı listesini yalnız sistem sahibi görür; yönetici e-postayla ekler.
      if (!mine.isOwner) throw new ForbiddenException('Kullanıcıyı e-postasıyla ekleyin.');
      user = await this.users.findOne({ where: { id: dto.userId } });
    } else if (dto.email) {
      user = await this.users.findOne({ where: { email: dto.email.trim() } });
    } else {
      throw new BadRequestException('Eklenecek kullanıcıyı seçin ya da yeni hesap bilgilerini girin.');
    }
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (user.role === UserRole.OWNER) {
      throw new BadRequestException('Sistem sahibi her dükkâna zaten erişir.');
    }
    if (await this.members.findOne({ where: { shopId, userId: user.id } })) {
      throw new ConflictException('Bu kullanıcı zaten bu dükkânın üyesi.');
    }
    const member = await this.members.save(
      this.members.create({ shopId, userId: user.id, isAdmin: !!dto.isAdmin, permissions }),
    );
    member.user = user;
    const others = await this.otherShopCounts([user.id], shopId);
    return this.view(member, others.get(user.id) ?? 0, true);
  }

  async updateMember(
    actor: ShopActor,
    shopId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<MemberView> {
    const mine = await this.requireManager(actor, shopId);
    const member = await this.memberIn(shopId, memberId);
    this.assertCanEdit(actor, mine, member);
    if (dto.permissions !== undefined) {
      const permissions = normalizePermissions(dto.permissions);
      this.assertCanGrant(mine, permissions);
      member.permissions = permissions;
    }
    if (dto.isAdmin !== undefined) member.isAdmin = dto.isAdmin;
    const saved = await this.members.save(member);
    const others = await this.otherShopCounts([member.userId], shopId);
    return this.view(saved, others.get(member.userId) ?? 0, true);
  }

  async removeMember(actor: ShopActor, shopId: string, memberId: string): Promise<void> {
    const mine = await this.requireManager(actor, shopId);
    const member = await this.memberIn(shopId, memberId);
    this.assertCanEdit(actor, mine, member);
    await this.members.delete({ id: member.id });
  }

  /**
   * Üyenin hesabı (ad, telefon, parola, etkin). Yönetici ancak kullanıcının
   * üye olduğu HER dükkânın yöneticisiyse düzenleyebilir — başka dükkândaki
   * bir hesabın parolasını değiştiremesin.
   */
  async updateMemberAccount(
    actor: ShopActor,
    shopId: string,
    memberId: string,
    dto: UpdateMemberAccountDto,
  ): Promise<MemberView> {
    const mine = await this.requireManager(actor, shopId);
    const member = await this.memberIn(shopId, memberId);
    this.assertCanEdit(actor, mine, member);
    if (!mine.isOwner) {
      const theirShops = await this.members.find({ where: { userId: member.userId } });
      const managed = new Set((await this.adminShops(actor)).map((s) => s.id));
      if (theirShops.some((m) => !managed.has(m.shopId))) {
        throw new ForbiddenException(
          'Bu kişi yönetmediğiniz bir dükkânda da çalışıyor; hesabını sistem sahibi düzenleyebilir.',
        );
      }
    }
    const user = await this.users.findOne({ where: { id: member.userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (dto.fullName !== undefined) user.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) user.phone = dto.phone.trim() || undefined;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    await this.users.save(user);
    member.user = user;
    const others = await this.otherShopCounts([user.id], shopId);
    return this.view(member, others.get(user.id) ?? 0, true);
  }

  /** Bu dükkânda çalışanlar + sistem sahipleri (formlardaki personel seçimi). */
  async staff(shopId: string): Promise<StaffView[]> {
    const rows = await this.members.find({ where: { shopId }, relations: { user: true } });
    const owners = await this.users.find({ where: { role: UserRole.OWNER, isActive: true } });
    const seen = new Set<string>();
    const out: StaffView[] = [];
    for (const u of [...rows.map((m) => m.user), ...owners]) {
      if (!u || !u.isActive || u.deletedAt || seen.has(u.id)) continue;
      seen.add(u.id);
      out.push({ id: u.id, fullName: u.fullName });
    }
    return out.sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
  }

  // ── Kurallar ────────────────────────────────────────────────────────

  /** Sistem sahibi ya da o dükkânın yöneticisi olmalı. */
  private async requireManager(actor: ShopActor, shopId: string): Promise<ShopAccessInfo> {
    const mine = await this.access.resolve(actor, shopId);
    if (!mine.isOwner && !mine.isAdmin) {
      throw new ForbiddenException('Bu dükkânın ekibini yalnız yöneticisi düzenleyebilir.');
    }
    return mine;
  }

  private canEdit(actor: ShopActor, mine: ShopAccessInfo, target: ShopMember): boolean {
    if (mine.isOwner) return true;
    if (target.userId === actor.id) return false;
    return isSubset(normalizePermissions(target.permissions), mine.permissions);
  }

  private assertCanEdit(actor: ShopActor, mine: ShopAccessInfo, target: ShopMember): void {
    if (mine.isOwner) return;
    if (target.userId === actor.id) {
      throw new ForbiddenException('Kendi üyeliğinizi değiştiremezsiniz.');
    }
    if (!isSubset(normalizePermissions(target.permissions), mine.permissions)) {
      throw new ForbiddenException('Bu kişinin izinleri sizinkini aşıyor; düzenleyemezsiniz.');
    }
  }

  private assertCanGrant(mine: ShopAccessInfo, permissions: ShopPermissions): void {
    if (mine.isOwner) return;
    const excess = excessPermissions(permissions, mine.permissions);
    if (excess.length) {
      throw new ForbiddenException(`Kendinizde olmayan izinleri veremezsiniz: ${excess.join(', ')}.`);
    }
  }

  private async memberIn(shopId: string, memberId: string): Promise<ShopMember> {
    const member = await this.members.findOne({
      where: { id: memberId, shopId },
      relations: { user: true },
    });
    if (!member) throw new NotFoundException('Üye bulunamadı.');
    return member;
  }

  private async adminShops(actor: ShopActor): Promise<Shop[]> {
    const rows = await this.members.find({
      where: { userId: actor.id, isAdmin: true },
      relations: { shop: true },
    });
    return rows
      .map((m) => m.shop!)
      .filter((s) => s && s.isActive && !s.deletedAt)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  private async otherShopCounts(userIds: string[], shopId: string): Promise<Map<string, number>> {
    if (!userIds.length) return new Map();
    const rows = await this.members.find({ where: { userId: In(userIds) } });
    const out = new Map<string, number>();
    for (const r of rows) {
      if (r.shopId !== shopId) out.set(r.userId, (out.get(r.userId) ?? 0) + 1);
    }
    return out;
  }

  private view(m: ShopMember, otherShops: number, editable: boolean): MemberView {
    return {
      id: m.id,
      userId: m.userId,
      fullName: m.user?.fullName ?? '',
      email: m.user?.email ?? '',
      phone: m.user?.phone ?? null,
      isActive: m.user?.isActive ?? false,
      isAdmin: m.isAdmin,
      permissions: normalizePermissions(m.permissions),
      otherShops,
      editable,
    };
  }
}

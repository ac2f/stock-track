import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum';
import { fullPermissions } from '../../common/shop/shop-permissions';
import { ShopsService } from './shops.service';

const SHOP_A = '00000000-0000-4000-8000-00000000000a';
const SHOP_B = '00000000-0000-4000-8000-00000000000b';

const adminUser = { id: 'admin-a', role: UserRole.EMPLOYEE };
const ownerUser = { id: 'owner', role: UserRole.OWNER };

function shop(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    isActive: true,
    status: 'active',
    plan: 'standard',
    subscriptionUntil: null,
    adminNote: 'SİSTEM SAHİBİNİN GİZLİ NOTU',
    features: { corel: true },
    createdAt: new Date(),
    deletedAt: null,
    ...extra,
  };
}

function build(opts: { memberRows?: unknown[]; userByEmail?: unknown; allowedTelegram?: boolean } = {}) {
  const shops = {
    find: jest.fn(async () => [shop(SHOP_A, 'Atölye A'), shop(SHOP_B, 'Atölye B')]),
  };
  const members = {
    // adminShops(): yöneticinin kendi üyelikleri; sharesManagedShop(): hedef kullanıcının üyelikleri
    find: jest.fn(async (q: { where: { userId?: string; isAdmin?: boolean; shopId?: string } }) => {
      if (q.where.isAdmin) return [{ shopId: SHOP_A, userId: 'admin-a', isAdmin: true, shop: shop(SHOP_A, 'Atölye A') }];
      return (opts.memberRows as never[]) ?? [];
    }),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (m: unknown) => m),
    create: jest.fn((m: unknown) => m),
  };
  const users = {
    find: jest.fn(async () => [
      { id: 'owner', fullName: 'Platform Sahibi', isActive: true, deletedAt: null },
    ]),
    findOne: jest.fn(async (q: { where: { email?: string; telegramUserId?: string; id?: string } }) => {
      if (q.where.email) return opts.userByEmail ?? null;
      if (q.where.telegramUserId) return { id: 'baska', fullName: 'Başka İşletmenin Çalışanı' };
      return null;
    }),
    save: jest.fn(async (u: unknown) => u),
  };
  const dataSource = { query: jest.fn(async () => [{ shop_id: SHOP_A, n: '3' }]) };
  const access = {
    resolve: jest.fn(async (_actor: unknown, shopId: string) => ({
      shopId,
      isOwner: false,
      isAdmin: true,
      permissions: fullPermissions(),
    })),
  };
  const settings = { isUserAllowed: jest.fn(async () => !!opts.allowedTelegram) };
  const service = new ShopsService(
    shops as never,
    members as never,
    users as never,
    dataSource as never,
    access as never,
    settings as never,
  );
  return { service, shops, members, users, access, settings };
}

describe('ShopsService — işletmeye gösterilen veri', () => {
  it('işletme yöneticisi sistem sahibinin gizli notunu ve özellik anahtarlarını görmez', async () => {
    const { service } = build();

    const list = await service.manageable(adminUser);

    expect(list).toHaveLength(1); // yalnız yönettiği dükkân (SHOP_A); mock tüm dükkânları döndürse de
    const json = JSON.stringify(list);
    expect(json).not.toContain('GİZLİ NOTU');
    expect(json).not.toContain('adminNote');
    expect(json).not.toContain('features');
    expect(list[0]).toMatchObject({ id: SHOP_A, name: 'Atölye A', memberCount: 3 });
  });

  it('sistem sahibi notu görür', async () => {
    const { service } = build();
    const list = await service.manageable(ownerUser);
    expect(list.map((s) => s.adminNote)).toEqual(['SİSTEM SAHİBİNİN GİZLİ NOTU', 'SİSTEM SAHİBİNİN GİZLİ NOTU']);
  });

  it('personel listesinde sistem sahibinin adı yalnız sistem sahibi isteyince çıkar', async () => {
    const { service, members } = build();
    members.find.mockResolvedValueOnce([
      { user: { id: 'c1', fullName: 'Çalışan', isActive: true, deletedAt: null } },
    ] as never);
    expect(await service.staff(SHOP_A)).toEqual([{ id: 'c1', fullName: 'Çalışan' }]);

    members.find.mockResolvedValueOnce([
      { user: { id: 'c1', fullName: 'Çalışan', isActive: true, deletedAt: null } },
    ] as never);
    const asOwner = await service.staff(SHOP_A, true);
    expect(asOwner.map((s) => s.fullName)).toEqual(['Çalışan', 'Platform Sahibi']);
  });
});

describe('ShopsService — ekibe kullanıcı ekleme', () => {
  const dto = { email: 'baska@ornek.com', permissions: {} };

  it('başka işletmenin çalışanı e-postayla EKLENEMEZ ve varlığı belli edilmez (404)', async () => {
    const stranger = { id: 'u-b', fullName: 'Başka', email: 'baska@ornek.com', role: UserRole.EMPLOYEE };
    // Hedefin üyelikleri yalnız yöneticinin yönetmediği SHOP_B'de.
    const { service, members } = build({ userByEmail: stranger, memberRows: [{ shopId: SHOP_B, userId: 'u-b' }] });

    await expect(service.addMember(adminUser, SHOP_A, dto as never)).rejects.toThrow(NotFoundException);
    expect(members.save).not.toHaveBeenCalled();
  });

  it('olmayan e-posta ile başka işletmedeki e-posta aynı yanıtı verir', async () => {
    const { service } = build({ userByEmail: null });
    await expect(service.addMember(adminUser, SHOP_A, dto as never)).rejects.toThrow('Kullanıcı bulunamadı.');
  });

  it('yöneticinin kendi yönettiği başka bir dükkânın üyesi eklenebilir (çok şubeli işletme)', async () => {
    const colleague = { id: 'u-a2', fullName: 'Şube Çalışanı', email: 'baska@ornek.com', role: UserRole.EMPLOYEE, phone: null };
    const { service, members } = build({ userByEmail: colleague, memberRows: [{ shopId: SHOP_A, userId: 'u-a2' }] });
    // Hedef zaten SHOP_A üyesi görünmesin ki ekleme yapılsın.
    members.findOne.mockResolvedValue(null);

    await expect(service.addMember(adminUser, SHOP_A, dto as never)).resolves.toMatchObject({ userId: 'u-a2' });
  });
});

describe('ShopsService — hesap düzenleme', () => {
  it('Telegram kimliği başka hesapta kayıtlıysa o hesabın kime ait olduğu söylenmez', async () => {
    const target = { id: 'u1', shopId: SHOP_A, userId: 'u1', user: { id: 'u1', fullName: 'Ali' } };
    const { service, members, users } = build();
    members.findOne.mockResolvedValue(target as never);
    users.findOne.mockImplementation((async (q: { where: { id?: string; telegramUserId?: string } }) =>
      q.where.telegramUserId ? { id: 'baska', fullName: 'Başka İşletmenin Çalışanı' } : { id: 'u1', fullName: 'Ali' }) as never);
    // yönetici yalnız SHOP_A'yı yönetir; hedef yalnız SHOP_A üyesi
    members.find.mockImplementation((async (q: { where: { isAdmin?: boolean } }) =>
      q.where.isAdmin
        ? [{ shopId: SHOP_A, userId: 'admin-a', isAdmin: true, shop: shop(SHOP_A, 'Atölye A') }]
        : [{ shopId: SHOP_A, userId: 'u1' }]) as never);

    const err = await service
      .updateMemberAccount(adminUser, SHOP_A, 'u1', { telegramUserId: '555666777' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).not.toContain('Başka İşletmenin Çalışanı');
  });

  it('işletme yöneticisi sistem sahibinin güvendiği Telegram kimliğini bir hesaba bağlayamaz', async () => {
    const target = { id: 'u1', shopId: SHOP_A, userId: 'u1', user: { id: 'u1', fullName: 'Ali' } };
    const { service, members, users } = build({ allowedTelegram: true });
    members.findOne.mockResolvedValue(target as never);
    users.findOne.mockResolvedValue({ id: 'u1', fullName: 'Ali' } as never);
    members.find.mockImplementation((async (q: { where: { isAdmin?: boolean } }) =>
      q.where.isAdmin
        ? [{ shopId: SHOP_A, userId: 'admin-a', isAdmin: true, shop: shop(SHOP_A, 'Atölye A') }]
        : [{ shopId: SHOP_A, userId: 'u1' }]) as never);

    await expect(
      service.updateMemberAccount(adminUser, SHOP_A, 'u1', { telegramUserId: '111222333' }),
    ).rejects.toThrow('başka bir hesaba bağlı');
    expect(users.save).not.toHaveBeenCalled();
  });
});

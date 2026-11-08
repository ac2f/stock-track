import { UserRole } from '../../../common/enums/user-role.enum';
import { User } from './user.entity';

describe('User → JSON', () => {
  const user = Object.assign(new User(), {
    id: 'u1',
    fullName: 'Ayşe Usta',
    email: 'ayse@ornek.com',
    phone: '0532 000 00 00',
    role: UserRole.OWNER,
    telegramUserId: '123456789',
    passwordHash: '$2b$10$gizli',
    isActive: true,
  });

  it('satış/ödeme/iş kayıtlarına gömülü kullanıcı yalnız id ve ad olarak serileşir', () => {
    const sale = { id: 's1', total: 100, soldBy: user };
    const out = JSON.parse(JSON.stringify(sale)) as { soldBy: Record<string, unknown> };
    expect(out.soldBy).toEqual({ id: 'u1', fullName: 'Ayşe Usta' });
    const text = JSON.stringify(sale);
    for (const leak of ['ayse@ornek.com', '0532', '123456789', 'gizli', 'owner']) {
      expect(text).not.toContain(leak);
    }
  });
});

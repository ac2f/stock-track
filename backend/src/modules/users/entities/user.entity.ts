import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserRole } from '../../../common/enums/user-role.enum';

/** Personel. Hem giriş yapan kullanıcı hem de iş kayıtlarında aktör. */
@Entity('users')
export class User extends BaseEntity {
  @Column({ name: 'full_name' })
  fullName: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column({ nullable: true })
  phone?: string;

  // select:false → sorgu sonuçlarında parola hash'i taşınmaz.
  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.EMPLOYEE })
  role: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /**
   * Telegram kullanıcı kimliği (botta /idx ile öğrenilir). Doluysa bu kişi
   * Telegram botunda yalnız üye olduğu dükkânları, kendi izinleriyle görür.
   */
  @Column({ name: 'telegram_user_id', type: 'varchar', length: 32, nullable: true, unique: true })
  telegramUserId?: string | null;
}

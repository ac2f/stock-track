import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { ShopContext } from '../../common/shop/shop-context';
import { fullPermissions } from '../../common/shop/shop-permissions';
import { seedShopDefaults } from '../../database/seed';
import { AuthResult, AuthService } from '../auth/auth.service';
import { GeoService } from '../geo/geo.service';
import { ShopMember } from '../shops/entities/shop-member.entity';
import { Shop } from '../shops/entities/shop.entity';
import { User } from '../users/entities/user.entity';
import { RegisterBusinessDto } from './dto/platform.dto';
import { ShopLabel } from './entities/shop-label.entity';
import { LabelsService } from './labels.service';
import { PlatformSettingsService } from './platform-settings.service';

export interface RegistrationResult {
  /** pending: yönetici onayı bekliyor; active: hemen kullanılabilir. */
  status: 'pending' | 'active';
  message: string;
  shop: { id: string; name: string };
  /** Yalnız active iken: kayıt biter bitmez oturum açılır. */
  auth?: AuthResult;
}

export interface BusinessRegisteredEvent {
  shopId: string;
  shopName: string;
  ownerName: string;
  email: string;
  phone: string;
  province: string;
  district: string;
  status: 'pending' | 'active';
}

const SALT_ROUNDS = 10;

const todayPlus = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Herkese açık işletme kaydı: işletme kendi BOŞ sistemiyle başlar (kendi
 * deposu, kataloğu, ayarları, müşterileri) ve yalnız kendi verisini görür.
 * Kayıt açık/kapalı, onaylı/onaysız ve deneme süresi platform ayarlarındandır.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settings: PlatformSettingsService,
    private readonly geo: GeoService,
    private readonly labels: LabelsService,
    private readonly auth: AuthService,
    private readonly events: EventEmitter2,
  ) {}

  async register(dto: RegisterBusinessDto): Promise<RegistrationResult> {
    const cfg = await this.settings.get();
    if (!cfg.registrationOpen) {
      throw new ForbiddenException('Yeni işletme kaydı şu an kapalı. Lütfen yönetici ile iletişime geçin.');
    }

    const province = this.geo.canonicalProvince(dto.province);
    if (!province) throw new BadRequestException('İl listeden seçilmelidir.');
    const district = this.geo.canonicalDistrict(province, dto.district);
    if (!district) throw new BadRequestException(`"${province}" iline ait bir ilçe seçin.`);
    await this.labels.assertUsable(dto.labelIds);

    const email = dto.email.trim().toLowerCase();
    const taken: unknown[] = await this.dataSource.query(`SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1`, [email]);
    if (taken.length) {
      throw new ConflictException('Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı deneyin.');
    }

    const status: 'pending' | 'active' = cfg.registrationAutoApprove ? 'active' : 'pending';
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    let userId = '';
    let shopId = '';
    try {
      await this.dataSource.transaction(async (m) => {
        const user = await m.save(
          m.create(User, {
            fullName: dto.ownerName,
            email,
            phone: dto.phone,
            role: UserRole.EMPLOYEE,
            isActive: true,
            passwordHash,
          }),
        );
        userId = user.id;
        const shop = await m.save(
          m.create(Shop, {
            name: dto.businessName,
            isActive: true,
            status,
            plan: cfg.trialDays > 0 ? 'deneme' : 'standard',
            subscriptionUntil: cfg.trialDays > 0 ? todayPlus(cfg.trialDays) : null,
            legalName: dto.businessName,
            contactPerson: dto.ownerName,
            phone: dto.phone,
            email,
            website: dto.website ?? null,
            province,
            district,
            addressLine: dto.addressLine ?? null,
            description: dto.description ?? null,
            directoryVisible: true,
            // Ağa katılım: yeni işletme açık başlar (profilinden kapatabilir).
            shareDebtInfo: true,
            shareCustomerInfo: true,
          }),
        );
        shopId = shop.id;
        await m.save(m.create(ShopMember, { shopId, userId, isAdmin: true, permissions: fullPermissions() }));
        for (const labelId of new Set(dto.labelIds)) {
          await m.save(m.create(ShopLabel, { shopId, labelId }));
        }
      });
    } catch (err) {
      // Eşzamanlı aynı e-posta: benzersiz dizin ikinci kaydı reddeder.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('Bu e-posta adresiyle zaten bir hesap var. Giriş yapmayı deneyin.');
      }
      throw err;
    }

    // İşletmenin boş sistemi: depo, tarifeler, örnek malzeme türleri. Başarısız olursa
    // yarım kalan hesap bırakılmaz.
    try {
      await ShopContext.forShop(shopId, () => seedShopDefaults(this.dataSource, { businessName: dto.businessName }));
    } catch (err) {
      this.logger.error(`İşletme varsayılanları kurulamadı (${dto.businessName}): ${(err as Error).message}`);
      await this.rollbackRegistration(shopId, userId);
      throw new InternalServerErrorException('Hesabınız oluşturulamadı. Lütfen biraz sonra tekrar deneyin.');
    }

    const event: BusinessRegisteredEvent = {
      shopId,
      shopName: dto.businessName,
      ownerName: dto.ownerName,
      email,
      phone: dto.phone,
      province,
      district,
      status,
    };
    this.events.emit('business.registered', event);
    this.logger.log(`Yeni işletme kaydı: ${dto.businessName} (${province}/${district}) — ${status}`);

    const user = await this.dataSource.getRepository(User).findOneOrFail({ where: { id: userId } });
    if (status === 'active') {
      return {
        status,
        message: 'Kaydınız tamamlandı. Hoş geldiniz!',
        shop: { id: shopId, name: dto.businessName },
        auth: await this.auth.issueFor(user),
      };
    }
    return {
      status,
      message:
        'Kaydınız alındı. Yönetici onayladığında e-posta adresiniz ve parolanızla giriş yapabilirsiniz.',
      shop: { id: shopId, name: dto.businessName },
    };
  }

  private async rollbackRegistration(shopId: string, userId: string): Promise<void> {
    try {
      await ShopContext.unscoped(() =>
        this.dataSource.transaction(async (m) => {
          for (const table of [
            'app_settings', 'processing_rates', 'material_categories', 'warehouses', 'expense_categories',
          ]) {
            await m.query(`DELETE FROM "${table}" WHERE shop_id = $1`, [shopId]);
          }
          await m.delete(ShopLabel, { shopId });
          await m.delete(ShopMember, { shopId });
          await m.query(`DELETE FROM shops WHERE id = $1`, [shopId]);
          await m.query(`DELETE FROM users WHERE id = $1`, [userId]);
        }),
      );
    } catch (err) {
      this.logger.error(`Yarım kalan kayıt temizlenemedi (shop ${shopId}): ${(err as Error).message}`);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessConfig } from '../../config/configuration';
import { AppSetting } from './entities/app-setting.entity';
import { UpdateBusinessDto } from './dto/update-business.dto';

/** Belgelerde/portalda kullanılan, çözülmüş işletme kimliği. */
export interface ResolvedBusiness {
  name: string;
  address: string;
  phone: string;
  taxNo: string;
  logoPath: string;
  portalBaseUrl: string;
  defaultCurrency: string;
}

/**
 * Çalışma-zamanı ayarları. Tek satır tutulur; ilk erişimde .env (BusinessConfig)
 * varsayılanlarından tohumlanır. Belge servisleri ve portal, işletme kimliğini
 * BURADAN okur — böylece ad/adres tek ekrandan düzenlenebilir.
 */
@Injectable()
export class SettingsService {
  private readonly business: BusinessConfig;

  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
    configService: ConfigService,
  ) {
    this.business = configService.get<BusinessConfig>('business')!;
  }

  /** Tek ayar satırını döndürür; yoksa .env varsayılanlarıyla oluşturur. */
  async getOrCreate(): Promise<AppSetting> {
    const existing = await this.repo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (existing) return existing;
    const created = this.repo.create({
      businessName: this.business.name,
      businessAddress: this.business.address ?? '',
      businessPhone: this.business.phone ?? '',
      businessTaxNo: this.business.taxNo ?? '',
      businessLogoPath: this.business.logoPath ?? '',
      portalBaseUrl: this.business.portalBaseUrl ?? '',
    });
    return this.repo.save(created);
  }

  /** Belge/portal için çözülmüş işletme kimliği (DB → .env yedeği). */
  async getBusiness(): Promise<ResolvedBusiness> {
    const s = await this.getOrCreate();
    return {
      name: s.businessName || this.business.name,
      address: s.businessAddress ?? '',
      phone: s.businessPhone ?? '',
      taxNo: s.businessTaxNo ?? '',
      logoPath: s.businessLogoPath ?? '',
      portalBaseUrl: s.portalBaseUrl || this.business.portalBaseUrl,
      defaultCurrency: this.business.defaultCurrency,
    };
  }

  async update(dto: UpdateBusinessDto): Promise<AppSetting> {
    const s = await this.getOrCreate();
    Object.assign(s, dto);
    return this.repo.save(s);
  }
}

import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Tek satırlık çalışma-zamanı ayarları. İşletme/proje kimliği (ad, adres,
 * telefon, VKN, logo, portal adresi) buradan düzenlenir ve belgelerde (PDF/HTML)
 * ile arayüz başlığında kullanılır. İlk erişimde .env varsayılanlarından tohumlanır.
 */
@Entity('app_settings')
export class AppSetting extends BaseEntity {
  @Column({ name: 'business_name' })
  businessName: string;

  @Column({ name: 'business_address', type: 'text', default: '' })
  businessAddress: string;

  @Column({ name: 'business_phone', default: '' })
  businessPhone: string;

  @Column({ name: 'business_tax_no', default: '' })
  businessTaxNo: string;

  @Column({ name: 'business_logo_path', default: '' })
  businessLogoPath: string;

  @Column({ name: 'portal_base_url', default: '' })
  portalBaseUrl: string;
}

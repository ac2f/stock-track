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

  // ── Telegram (arayüzden düzenlenir; boşsa .env değerine düşülür) ──
  /** Bot jetonu (@BotFather). Boşsa TELEGRAM_BOT_TOKEN kullanılır. */
  @Column({ name: 'telegram_bot_token', default: '' })
  telegramBotToken: string;

  /** Bildirim/hatırlatmaların gideceği sohbet. Boşsa TELEGRAM_OWNER_CHAT_ID. */
  @Column({ name: 'telegram_chat_id', default: '' })
  telegramChatId: string;

  /** Şifreli yedeğin gideceği sohbet. Boşsa yukarıdaki bildirim sohbeti. */
  @Column({ name: 'backup_telegram_chat_id', default: '' })
  backupTelegramChatId: string;

  /**
   * Telegram üzerinden İŞLEM YAPABİLECEK kullanıcıların sayısal kimlikleri
   * (virgülle ayrılmış). Liste boşken hiç kimse yetkili değildir — bot yalnızca
   * kişiye kendi kimliğini söyler. Grup kimliği DEĞİL, kullanıcı kimliğidir.
   */
  @Column({ name: 'telegram_allowed_user_ids', type: 'text', default: '' })
  telegramAllowedUserIds: string;
}

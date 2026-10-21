import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Bütün sisteme ait (dükkândan bağımsız) tek satırlık ayarlar: tek bir
 * Telegram botu tüm dükkânlara hizmet eder, yedek tüm veritabanını kapsar.
 * Dükkâna özgü ayarlar (işletme kimliği, fiyatlar, bildirim sohbeti, Corel
 * anahtarı ...) AppSetting'dedir.
 */
@Entity('system_settings')
export class SystemSetting extends BaseEntity {
  /** Bot jetonu (@BotFather). Boşsa TELEGRAM_BOT_TOKEN kullanılır. */
  @Column({ name: 'telegram_bot_token', default: '' })
  telegramBotToken: string;

  /** Şifreli yedeğin gideceği sohbet. Boşsa ilk dükkânın bildirim sohbeti. */
  @Column({ name: 'backup_telegram_chat_id', default: '' })
  backupTelegramChatId: string;

  /**
   * Telegram üzerinden işlem yapabilecek kullanıcıların sayısal kimlikleri
   * (virgülle ayrılmış). Bu kişiler botta bütün dükkânlara erişir; liste
   * boşken hiç kimse yetkili değildir.
   */
  @Column({ name: 'telegram_allowed_user_ids', type: 'text', default: '' })
  telegramAllowedUserIds: string;

  /** Bu kurulumun kalıcı kimliği (eşitlemede: replika doğru merkeze mi bağlı?). */
  @Column({ name: 'instance_id', type: 'uuid', default: () => 'gen_random_uuid()' })
  instanceId: string;

  /** Değişiklik günlüğünün silindiği son sıra; daha gerisini isteyen replika baştan eşitlenir. */
  @Column({ name: 'sync_pruned_seq', type: 'bigint', default: 0 })
  syncPrunedSeq: string;
}

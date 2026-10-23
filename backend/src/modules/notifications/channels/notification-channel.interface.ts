import { NotificationChannel } from '../enums/notification.enums';
import { NotificationTopic } from '../enums/notification-topic';

export interface OutboundMessage {
  recipient?: string; // genel/yedek hedef (defterde gösterim için)
  telegramChatId?: string; // Telegram'a özel hedef
  whatsappPhone?: string; // WhatsApp'a özel hedef (telefon)
  subject?: string;
  body: string;
  /** Dükkânın konu yönlendirmesi için (açık hedef yoksa). */
  topic?: NotificationTopic | null;
}

export interface ChannelResult {
  success: boolean;
  error?: string;
}

/**
 * Bildirim kanalı portu (Strategy). Yeni bir kanal (e-posta, SMS, WhatsApp)
 * bu arayüzü uygulayarak eklenir; iş kodu değişmez.
 */
export interface NotificationChannelPort {
  readonly channel: NotificationChannel;
  /**
   * Kanalın kullanılabilir olup olmadığı (ör. token tanımlı mı).
   * Ayarlarını çalışma zamanında (veritabanından) okuyan kanallar için
   * Promise dönebilir.
   */
  isEnabled(): boolean | Promise<boolean>;
  /**
   * Bu mesajı göndermeli mi? (ör. dükkân bu konuyu Telegram'da kapatmış).
   * Yoksa her mesaj gönderilir; hayırsa deftere de yazılmaz.
   */
  accepts?(message: OutboundMessage): Promise<boolean>;
  send(message: OutboundMessage): Promise<ChannelResult>;
}

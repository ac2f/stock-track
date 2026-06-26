import { NotificationChannel } from '../enums/notification.enums';

export interface OutboundMessage {
  recipient?: string; // hedef (telegram chat id vb.)
  subject?: string;
  body: string;
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
  /** Kanalın kullanılabilir olup olmadığı (ör. token tanımlı mı). */
  isEnabled(): boolean;
  send(message: OutboundMessage): Promise<ChannelResult>;
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '../enums/notification.enums';
import {
  ChannelResult,
  NotificationChannelPort,
  OutboundMessage,
} from './notification-channel.interface';

/**
 * WhatsApp kanalı (Meta Cloud API). Telegram kanalıyla aynı port; tek fark
 * uç nokta ve kimlik. WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID tanımlı değilse
 * kanal pasiftir (Log + Telegram çalışmaya devam eder). Ağ/erişim yoksa hata
 * toleranslıdır → iş akışını bozmaz.
 *
 * Not: Meta, işletme tarafından başlatılan mesajlarda onaylı şablon ve 24 saatlik
 * oturum penceresi kuralları uygular; bu MVP serbest metin gönderir.
 */
@Injectable()
export class WhatsappChannel implements NotificationChannelPort {
  readonly channel = NotificationChannel.WHATSAPP;
  private readonly logger = new Logger(WhatsappChannel.name);
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;

  constructor(configService: ConfigService) {
    this.token = configService.get<string>('notifications.whatsappToken') ?? '';
    this.phoneNumberId =
      configService.get<string>('notifications.whatsappPhoneNumberId') ?? '';
    this.apiVersion =
      configService.get<string>('notifications.whatsappApiVersion') ?? 'v21.0';
  }

  isEnabled(): boolean {
    return !!this.token && !!this.phoneNumberId;
  }

  async send(message: OutboundMessage): Promise<ChannelResult> {
    const to = message.whatsappPhone || message.recipient;
    if (!this.isEnabled() || !to) {
      return {
        success: false,
        error: 'WhatsApp yapılandırılmamış veya alıcı telefonu yok.',
      };
    }
    const text = message.subject
      ? `*${message.subject}*\n${message.body}`
      : message.body;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: this.normalize(to),
            type: 'text',
            text: { body: text },
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `WhatsApp ${res.status}: ${body}` };
      }
      return { success: true };
    } catch (err) {
      this.logger.warn(`WhatsApp gönderimi başarısız: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  /** Telefonu sade rakam dizisine indirger (E.164 için '+', boşluk vb. temizlenir). */
  private normalize(phone: string): string {
    return phone.replace(/[^\d]/g, '');
  }
}

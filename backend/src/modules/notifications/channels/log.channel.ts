import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '../enums/notification.enums';
import {
  ChannelResult,
  NotificationChannelPort,
  OutboundMessage,
} from './notification-channel.interface';

/**
 * Varsayılan kanal: bildirimi loglar. Her zaman kullanılabilir; harici
 * bağımlılık yoktur. Gönderim defteri (Notification entity) zaten servis
 * tarafından yazılır.
 */
@Injectable()
export class LogChannel implements NotificationChannelPort {
  readonly channel = NotificationChannel.LOG;
  private readonly logger = new Logger('Notification');

  isEnabled(): boolean {
    return true;
  }

  async send(message: OutboundMessage): Promise<ChannelResult> {
    this.logger.log(
      `[${message.subject ?? 'bildirim'}] ${message.body}` +
        (message.recipient ? ` → ${message.recipient}` : ''),
    );
    return { success: true };
  }
}

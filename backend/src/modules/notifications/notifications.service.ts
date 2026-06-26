import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationStatus,
  NotificationType,
} from './enums/notification.enums';
import { Notification } from './entities/notification.entity';
import { LogChannel } from './channels/log.channel';
import { TelegramChannel } from './channels/telegram.channel';
import { NotificationChannelPort } from './channels/notification-channel.interface';

export interface NotifyParams {
  type: NotificationType;
  body: string;
  subject?: string;
  recipient?: string; // telegram chat id (yoksa varsayılan owner chat'i)
  relatedType?: string;
  relatedId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly channels: NotificationChannelPort[];

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    private readonly logChannel: LogChannel,
    private readonly telegramChannel: TelegramChannel,
  ) {
    // Log her zaman; Telegram etkinse eklenir.
    this.channels = [logChannel, telegramChannel];
  }

  /**
   * Bildirimi etkin kanallara dağıtır ve her gönderimi defterleştirir.
   * Hiçbir kanal hatası iş akışını bozmaz (fire-and-forget güvenli).
   */
  async notify(params: NotifyParams): Promise<void> {
    for (const channel of this.channels) {
      if (!channel.isEnabled()) {
        continue;
      }
      const record = await this.notificationsRepo.save(
        this.notificationsRepo.create({
          type: params.type,
          channel: channel.channel,
          status: NotificationStatus.PENDING,
          recipient: params.recipient,
          subject: params.subject,
          body: params.body,
          relatedType: params.relatedType,
          relatedId: params.relatedId,
        }),
      );

      const result = await channel.send({
        recipient: params.recipient,
        subject: params.subject,
        body: params.body,
      });

      record.status = result.success
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;
      record.error = result.error;
      record.sentAt = result.success ? new Date() : undefined;
      await this.notificationsRepo.save(record);
    }
  }

  list(limit = 50): Promise<Notification[]> {
    return this.notificationsRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from './enums/notification.enums';
import { ShopContext } from '../../common/shop/shop-context';
import { ShopAccessService } from '../shops/shop-access.service';
import { Notification } from './entities/notification.entity';
import { LogChannel } from './channels/log.channel';
import { TelegramChannel } from './channels/telegram.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { NotificationChannelPort } from './channels/notification-channel.interface';

export interface NotifyParams {
  type: NotificationType;
  body: string;
  subject?: string;
  recipient?: string; // genel/yedek hedef (defterde gösterim)
  telegramChatId?: string; // Telegram'a özel hedef (yoksa varsayılan owner chat'i)
  whatsappPhone?: string; // WhatsApp'a özel hedef (telefon)
  relatedType?: string;
  relatedId?: string;
  /** Yalnız bu kanallar (verilmezse etkin olan hepsi). */
  channels?: NotificationChannel[];
}

@Injectable()
export class NotificationsService {
  private readonly channels: NotificationChannelPort[];

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    private readonly logChannel: LogChannel,
    private readonly telegramChannel: TelegramChannel,
    private readonly whatsappChannel: WhatsappChannel,
    private readonly shopAccess: ShopAccessService,
  ) {
    // Log her zaman; Telegram ve WhatsApp etkinse eklenir.
    this.channels = [logChannel, telegramChannel, whatsappChannel];
  }

  /**
   * Bildirimi etkin kanallara dağıtır ve her gönderimi defterleştirir.
   * Hiçbir kanal hatası iş akışını bozmaz (fire-and-forget güvenli).
   */
  async notify(params: NotifyParams): Promise<void> {
    // Bildirim geçmişi dükkân başınadır. Dükkânsız çalışan sistem görevleri
    // (yedek) ilk açık dükkânın geçmişine ve bildirim sohbetine yazar.
    if (!ShopContext.shopId()) {
      const first = (await this.shopAccess.activeShops())[0];
      if (!first) return;
      return ShopContext.forShop(first.id, () => this.notify(params));
    }
    for (const channel of this.channels) {
      if (params.channels && !params.channels.includes(channel.channel)) {
        continue;
      }
      // Kanal ayarlarını çalışma zamanında okuyabilir (Telegram) → await.
      if (!(await channel.isEnabled())) {
        continue;
      }
      const record = await this.notificationsRepo.save(
        this.notificationsRepo.create({
          type: params.type,
          channel: channel.channel,
          status: NotificationStatus.PENDING,
          recipient:
            params.recipient ?? params.telegramChatId ?? params.whatsappPhone,
          subject: params.subject,
          body: params.body,
          relatedType: params.relatedType,
          relatedId: params.relatedId,
        }),
      );

      const result = await channel.send({
        recipient: params.recipient,
        telegramChatId: params.telegramChatId,
        whatsappPhone: params.whatsappPhone,
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

  /** Bildirim defterinin büyüklüğü (bakım ekranında gösterilir). */
  async stats(): Promise<{ total: number; oldestAt: string | null }> {
    const [oldest, total] = await Promise.all([
      this.notificationsRepo.findOne({
        where: {},
        order: { createdAt: 'ASC' },
      }),
      this.notificationsRepo.count(),
    ]);
    return {
      total,
      oldestAt: oldest ? new Date(oldest.createdAt).toISOString() : null,
    };
  }

  /**
   * Bildirim defterini temizler. `olderThanDays` verilirse yalnızca o günden
   * eski kayıtlar silinir; verilmezse defter tamamen boşaltılır.
   * Bu kayıtlar yalnızca gönderim geçmişidir — silinmesi iş verisini etkilemez.
   */
  async clear(olderThanDays?: number): Promise<{ deleted: number }> {
    const qb = this.notificationsRepo.createQueryBuilder().delete();
    if (olderThanDays != null && olderThanDays > 0) {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      qb.where('created_at < :cutoff', { cutoff });
    }
    const result = await qb.execute();
    return { deleted: result.affected ?? 0 };
  }
}

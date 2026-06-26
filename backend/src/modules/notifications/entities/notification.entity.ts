import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '../enums/notification.enums';

/** Gönderilen bildirimlerin defteri (uygulama içi geçmiş + denetim). */
@Entity('notifications')
@Index(['type', 'createdAt'])
export class Notification extends BaseEntity {
  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.PENDING })
  status: NotificationStatus;

  // Hedef (telegram chat id, e-posta vb.); log kanalında boş olabilir.
  @Column({ nullable: true })
  recipient?: string;

  @Column({ nullable: true })
  subject?: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date;

  // İlgili kayıt (ör. payment / sale / plate) izlenebilirlik için.
  @Column({ name: 'related_type', nullable: true })
  relatedType?: string;

  @Column({ name: 'related_id', nullable: true })
  relatedId?: string;
}

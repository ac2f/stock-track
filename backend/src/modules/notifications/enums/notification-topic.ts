import { NotificationType } from './notification.enums';

/**
 * Telegram'da konu: her dükkân her konuyu bildirim sohbetine, başka bir
 * sohbete (kanal/grup) gönderebilir ya da kapatabilir. Birden çok dükkân
 * aynı sohbeti paylaşabilir; mesajın başına dükkân adı eklenir.
 */
export enum NotificationTopic {
  SALES = 'sales',
  PAYMENTS = 'payments',
  STOCK = 'stock',
  DEBT = 'debt',
  MORNING = 'morning',
  COREL = 'corel',
}

export const NOTIFICATION_TOPICS: { key: NotificationTopic; label: string; hint: string }[] = [
  { key: NotificationTopic.SALES, label: 'Satışlar', hint: 'Satış kaydedildi, malzemesi satılan sahibe pay' },
  { key: NotificationTopic.PAYMENTS, label: 'Tahsilat ve ödemeler', hint: 'Sohbeti olmayan müşterinin ödeme bildirimi' },
  { key: NotificationTopic.STOCK, label: 'Kritik stok', hint: 'Eşiğin altına düşen malzeme' },
  { key: NotificationTopic.DEBT, label: 'Borç hatırlatmaları', hint: 'Sohbeti olmayan borçlunun hatırlatması' },
  { key: NotificationTopic.MORNING, label: 'Sabah özeti', hint: 'Günün işleri, gereken plakalar' },
  {
    key: NotificationTopic.COREL,
    label: 'Corel ve klasörler',
    hint: 'Runner klasör açtı, sorun bildirdi, bağlantısı koptu',
  },
];

const TOPIC_KEYS = new Set<string>(NOTIFICATION_TOPICS.map((t) => t.key));

export function isTopic(value: string): value is NotificationTopic {
  return TOPIC_KEYS.has(value);
}

/** Bildirim tipinin konusu; yedek ve genel mesajların konusu yoktur. */
export function topicOf(type: NotificationType): NotificationTopic | null {
  switch (type) {
    case NotificationType.SALE_CREATED:
      return NotificationTopic.SALES;
    case NotificationType.PAYMENT_RECEIVED:
      return NotificationTopic.PAYMENTS;
    case NotificationType.STOCK_LOW:
      return NotificationTopic.STOCK;
    case NotificationType.DEBT_REMINDER:
      return NotificationTopic.DEBT;
    case NotificationType.MORNING_SUMMARY:
      return NotificationTopic.MORNING;
    case NotificationType.COREL_FOLDERS:
    case NotificationType.COREL_RUNNER:
      return NotificationTopic.COREL;
    default:
      return null;
  }
}

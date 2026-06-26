/** Bildirimin gönderildiği kanal. */
export enum NotificationChannel {
  LOG = 'log', // uygulama içi defter (her zaman çalışır)
  TELEGRAM = 'telegram', // Telegram bot
}

/** Bildirimin gönderim durumu. */
export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

/** Bildirim tipi (iş olayına göre). */
export enum NotificationType {
  PAYMENT_RECEIVED = 'payment_received',
  SALE_CREATED = 'sale_created',
  STOCK_LOW = 'stock_low',
  DEBT_REMINDER = 'debt_reminder',
  GENERIC = 'generic',
}

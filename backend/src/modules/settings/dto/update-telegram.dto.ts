import { IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Telegram ayarları güncelleme.
 * Alan gönderilmezse değişmez; BOŞ gönderilirse temizlenir ve .env değerine
 * geri düşülür (böylece arayüzden geçici olarak devre dışı bırakılabilir).
 */
export class UpdateTelegramDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  telegramBotToken?: string;

  /** Boş = temizle; doluysa sayısal kimlik (-100…) ya da @kanaladı. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^\s*(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{3,31})?\s*$/, {
    message: 'Sohbet kimliği -1001234567890 gibi bir sayı ya da @kanaladı olmalı.',
  })
  telegramChatId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^\s*(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{3,31})?\s*$/, {
    message: 'Yedek sohbet kimliği -1001234567890 gibi bir sayı ya da @kanaladı olmalı.',
  })
  backupTelegramChatId?: string;

  /** Telegram'dan işlem yapabilecek kullanıcı kimlikleri (virgülle ayrık). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  telegramAllowedUserIds?: string;

  /**
   * Konu başına hedef: { sales: { chatId: '-100…' }, corel: { off: true } }.
   * Verilen nesne öncekinin yerine geçer; tanınmayan konular atılır.
   */
  @IsOptional()
  @IsObject()
  telegramRoutes?: Record<string, { chatId?: string; off?: boolean }>;
}

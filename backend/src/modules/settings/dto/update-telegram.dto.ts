import { IsOptional, IsString, MaxLength } from 'class-validator';

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

  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramChatId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  backupTelegramChatId?: string;

  /** Telegram'dan işlem yapabilecek kullanıcı kimlikleri (virgülle ayrık). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  telegramAllowedUserIds?: string;
}

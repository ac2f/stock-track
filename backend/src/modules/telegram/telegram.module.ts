import { Module } from '@nestjs/common';
import { BackupsModule } from '../backups/backups.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { CustomersModule } from '../customers/customers.module';
import { MaterialsModule } from '../materials/materials.module';
import { ReportsModule } from '../reports/reports.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { TelegramApiService } from './telegram-api.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramScreensService } from './telegram-screens.service';
import { TelegramSessionService } from './telegram-session.service';

/**
 * Telegram arayüzü: web uygulamasındaki günlük işlemleri sohbet üzerinden
 * yaptıran interaktif menü botu.
 *
 * Bot, getUpdates ile TEK tüketici olarak çalışır (Telegram aynı jeton için
 * ikinci tüketiciye izin vermez). Her olay, işlenmeden önce ayarlardaki
 * yetkili kullanıcı listesine karşı doğrulanır.
 */
@Module({
  imports: [
    SettingsModule,
    CustomersModule,
    MaterialsModule,
    ReportsModule,
    UsersModule,
    BankAccountsModule,
    BackupsModule,
  ],
  providers: [
    TelegramApiService,
    TelegramSessionService,
    TelegramScreensService,
    TelegramBotService,
  ],
  exports: [TelegramApiService],
})
export class TelegramModule {}

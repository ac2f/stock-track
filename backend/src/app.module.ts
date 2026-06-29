import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { typeOrmAsyncConfig } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { ProcessingModule } from './modules/processing/processing.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesModule } from './modules/sales/sales.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PortalModule } from './modules/portal/portal.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Konfigürasyon: global, .env doğrulamalı, tipli.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),

    // Veritabanı bağlantısı (async fabrika ile ConfigService'ten beslenir).
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),

    // Olay yayını (bildirim) ve zamanlanmış görevler (kur/hatırlatma).
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),

    // İş modülleri (bounded contexts).
    AuthModule,
    UsersModule,
    SuppliersModule,
    VehiclesModule,
    BankAccountsModule,
    WarehousesModule,
    CurrencyModule,
    MaterialsModule,
    PurchasesModule,
    ProcessingModule,
    CustomersModule,
    SalesModule,
    QuotesModule,
    ReportsModule,
    ExpensesModule,
    DocumentsModule,
    SettingsModule,
    PortalModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

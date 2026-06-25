import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { typeOrmAsyncConfig } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { ProcessingModule } from './modules/processing/processing.module';
import { CustomersModule } from './modules/customers/customers.module';
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

    // İş modülleri (bounded contexts).
    AuthModule,
    UsersModule,
    SuppliersModule,
    VehiclesModule,
    BankAccountsModule,
    MaterialsModule,
    PurchasesModule,
    ProcessingModule,
    CustomersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

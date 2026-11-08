import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { SettingsModule } from '../settings/settings.module';
import { CurrencyModule } from '../currency/currency.module';
import { Customer } from './entities/customer.entity';
import { CustomerLedgerEntry } from './entities/customer-ledger-entry.entity';
import { Payment } from './entities/payment.entity';
import { CustomersController } from './controllers/customers.controller';
import { PaymentsController } from './controllers/payments.controller';
import { PaymentsAdminController } from './controllers/payments-admin.controller';
import { CustomerNetworkController } from './controllers/customer-network.controller';
import { CustomersService } from './services/customers.service';
import { PaymentsService } from './services/payments.service';
import { CustomerAccountService } from './services/customer-account.service';
import { CustomerNetworkService } from './services/customer-network.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerLedgerEntry, Payment]),
    UsersModule, // ödemede teslim alan çalışanı doğrulamak için
    BankAccountsModule, // havalede banka hesabını doğrulamak için
    CurrencyModule, // yabancı para ödemeyi baz tutara çevirmek için
    SettingsModule, // müşteri portalı bağlantısının temel adresi
  ],
  controllers: [CustomersController, PaymentsController, PaymentsAdminController, CustomerNetworkController],
  providers: [CustomersService, PaymentsService, CustomerAccountService, CustomerNetworkService],
  // İşleme modülü, faturalandırmada CustomerAccountService kullanır.
  // Telegram arayüzü tahsilat kaydı için PaymentsService'i de kullanır.
  exports: [CustomerAccountService, CustomersService, PaymentsService],
})
export class CustomersModule {}

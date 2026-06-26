import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { CurrencyModule } from '../currency/currency.module';
import { Customer } from './entities/customer.entity';
import { CustomerLedgerEntry } from './entities/customer-ledger-entry.entity';
import { Payment } from './entities/payment.entity';
import { CustomersController } from './controllers/customers.controller';
import { PaymentsController } from './controllers/payments.controller';
import { CustomersService } from './services/customers.service';
import { PaymentsService } from './services/payments.service';
import { CustomerAccountService } from './services/customer-account.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerLedgerEntry, Payment]),
    UsersModule, // ödemede teslim alan çalışanı doğrulamak için
    BankAccountsModule, // havalede banka hesabını doğrulamak için
    CurrencyModule, // yabancı para ödemeyi baz tutara çevirmek için
  ],
  controllers: [CustomersController, PaymentsController],
  providers: [CustomersService, PaymentsService, CustomerAccountService],
  // İşleme modülü, faturalandırmada CustomerAccountService kullanır.
  exports: [CustomerAccountService, CustomersService],
})
export class CustomersModule {}

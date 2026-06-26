import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { CurrencyController } from './currency.controller';
import { CurrencyService } from './currency.service';
import { ExchangeRateScheduler } from './exchange-rate.scheduler';

@Module({
  imports: [TypeOrmModule.forFeature([ExchangeRate])],
  controllers: [CurrencyController],
  providers: [CurrencyService, ExchangeRateScheduler],
  exports: [CurrencyService],
})
export class CurrencyModule {}

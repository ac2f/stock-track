import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { UpdatePaymentDto } from '../dto/update-payment.dto';
import { QueryCustomerPaymentsDto } from '../dto/query-payment.dto';
import { PaymentsService } from '../services/payments.service';
import { ShopScope } from '../../../common/shop/shop-access.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@ShopScope('payments')
@Controller({ path: 'customers/:customerId/payments', version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Nakit tahsilat çalışanın yetkisindedir.
  @Post()
  create(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(customerId, dto);
  }

  // ?method=&from=&to= süzgeci; ?page=&limit= verilirse sayfalı yanıt.
  @Get()
  list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: QueryCustomerPaymentsDto,
  ) {
    return this.paymentsService.list(customerId, query);
  }

  // Çalışan yalnızca son 3 günü düzenleyebilir; Sahip için süre sınırı yok.
  @Patch(':paymentId')
  update(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser('role') role: string,
  ) {
    return this.paymentsService.update(customerId, paymentId, dto, role);
  }

  // Yanlış girilen ödemeyi geri al: bağlı cari hareketleri (borç kapatma
  // indirimi dahil) silinir, bakiye eski haline döner. Çalışan yalnızca son
  // 3 gün içindekini, Sahip her zaman silebilir.
  @Delete(':paymentId')
  remove(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.paymentsService.remove(customerId, paymentId, role);
  }
}

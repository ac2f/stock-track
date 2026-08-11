import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { UpdatePaymentDto } from '../dto/update-payment.dto';
import { PaymentsService } from '../services/payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'customers/:customerId/payments', version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Nakit tahsilat çalışanın yetkisindedir.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Post()
  create(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(customerId, dto);
  }

  @Get()
  list(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.paymentsService.list(customerId);
  }

  // Çalışan yalnızca son 3 günü düzenleyebilir; Sahip için süre sınırı yok.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
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
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Delete(':paymentId')
  remove(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.paymentsService.remove(customerId, paymentId, role);
  }
}

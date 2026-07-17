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

  // Yalnızca son 3 gün içinde kaydedilmiş ödemeler düzenlenebilir.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Patch(':paymentId')
  update(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.paymentsService.update(customerId, paymentId, dto);
  }

  // Yalnızca son 3 gün içinde kaydedilmiş ödemeler silinebilir.
  @Roles(UserRole.OWNER, UserRole.EMPLOYEE)
  @Delete(':paymentId')
  remove(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentsService.remove(customerId, paymentId);
  }
}

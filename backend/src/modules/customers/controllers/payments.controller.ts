import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CreatePaymentDto } from '../dto/create-payment.dto';
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
}

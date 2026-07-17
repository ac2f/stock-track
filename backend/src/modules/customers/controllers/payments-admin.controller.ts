import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { PaymentsService } from '../services/payments.service';
import { QueryPaymentDto, SettleCashDto } from '../dto/query-payment.dto';
import { ConvertLegacyDebtCloseDto } from '../dto/convert-legacy-debt-close.dto';

/**
 * Çapraz-müşteri ödeme yönetimi (yalnızca İşletme Sahibi):
 *  - hangi çalışanın hangi tahsilatları aldığını sorgulama,
 *  - çalışanların üzerindeki tahsil edilmemiş nakdi toplu "tahsil etme".
 */
@ApiTags('payments')
@ApiBearerAuth()
@Roles(UserRole.OWNER)
@Controller({ path: 'payments', version: '1' })
export class PaymentsAdminController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // #4 Hangi çalışan hangi tahsilatları aldı (filtrelenebilir).
  @Get()
  query(@Query() query: QueryPaymentDto) {
    return this.paymentsService.query(query);
  }

  // #5 Çalışan bazında tahsil edilmemiş nakit özeti.
  @Get('cash-collections')
  cashCollections() {
    return this.paymentsService.cashCollectionsByEmployee();
  }

  // #5 Bir çalışanın tahsil edilmemiş nakdini toplu tahsil et (bir daha çıkmaz).
  @Post('settle')
  settle(@Body() dto: SettleCashDto) {
    return this.paymentsService.settleEmployeeCash(dto.receivedById);
  }

  // Uyumluluk: eski "borç kapatma" hareketleri (gerçek ödeme kaydı yok).
  @Get('legacy-debt-closings')
  legacyDebtClosings() {
    return this.paymentsService.listLegacyDebtClosings();
  }

  // Eski bir borç kapatma hareketini gerçek ödemeye çevir (bakiye değişmez).
  @Post('legacy-debt-closings/:ledgerEntryId/convert')
  convertLegacyDebtClose(
    @Param('ledgerEntryId', ParseUUIDPipe) ledgerEntryId: string,
    @Body() dto: ConvertLegacyDebtCloseDto,
  ) {
    return this.paymentsService.convertLegacyDebtClose(ledgerEntryId, dto);
  }
}

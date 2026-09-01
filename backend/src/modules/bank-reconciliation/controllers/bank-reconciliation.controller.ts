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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { BankTxMatchType, BankTxStatus } from '../entities/bank-transaction.entity';
import { BankReconciliationService } from '../services/bank-reconciliation.service';
import { ConfirmMatchDto, ImportStatementDto } from '../dto/bank-reconciliation.dto';

/**
 * Banka mutabakatı (yalnızca İşletme Sahibi — mali veri).
 *
 * Hareketler ekstre dosyasından ya da ileride banka API'sinden gelir; burada
 * uygulamadaki tahsilat/ödeme ve gider kayıtlarıyla eşleştirilir. Eşleştirme
 * her zaman kullanıcı onayıyla olur.
 */
@ApiTags('bank-reconciliation')
@ApiBearerAuth()
@Roles(UserRole.OWNER)
@Controller({ path: 'bank-reconciliation', version: '1' })
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  /** Ekstre (CSV metni) içe aktarır; sütun eşlemesi gövdede verilir. */
  @Post('import')
  importStatement(@Body() dto: ImportStatementDto) {
    return this.service.importCsv(
      dto.bankAccountId,
      dto.csv,
      dto.mapping,
      dto.currency,
    );
  }

  /** Mutabakat kuyruğu. `?status=unmatched` varsayılan görünümdür. */
  @Get()
  list(
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: BankTxStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list({ bankAccountId, status, from, to });
  }

  /** Özet: kaç hareket bekliyor, giriş/çıkış tutarları. */
  @Get('summary')
  summary(@Query('bankAccountId') bankAccountId?: string) {
    return this.service.summary(bankAccountId);
  }

  /** Bir hareket için puanlanmış eşleşme adayları. */
  @Get(':id/suggestions')
  suggestions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.suggestions(id);
  }

  /** Adayı onaylar — eşleştirme yalnızca burada kesinleşir. */
  @Post(':id/match')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmMatchDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.confirm(
      id,
      dto.type as BankTxMatchType,
      dto.matchId,
      userId,
    );
  }

  /** Eşleştirmeyi geri alır. */
  @Post(':id/unmatch')
  unmatch(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.unmatch(id);
  }

  /** Hareketi mutabakat dışında bırakır (ör. hesaplar arası virman). */
  @Post(':id/ignore')
  ignore(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.ignore(id);
  }
}

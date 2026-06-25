import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { BusinessConfig } from '../../../config/configuration';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../common/dto/paginated-result';
import { roundMoney, totalAreaM2 } from '../../../common/utils/area.util';
import { PlatesService } from '../../materials/services/plates.service';
import { CustomerAccountService } from '../../customers/services/customer-account.service';
import { ProcessingJob } from '../entities/processing-job.entity';
import { CreateProcessingJobDto } from '../dto/create-processing-job.dto';
import { QueryProcessingJobDto } from '../dto/query-processing-job.dto';
import { ProcessingRatesService } from './processing-rates.service';

@Injectable()
export class ProcessingService {
  private readonly business: BusinessConfig;

  constructor(
    @InjectRepository(ProcessingJob)
    private readonly jobsRepo: Repository<ProcessingJob>,
    private readonly platesService: PlatesService,
    private readonly ratesService: ProcessingRatesService,
    private readonly accountService: CustomerAccountService,
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.business = configService.get<BusinessConfig>('business')!;
  }

  /**
   * İşleme kaydı oluşturur. TEK transaction içinde:
   *  1) etkin m² fiyatını çözer (dinamik override > şablon > sistem varsayılanı),
   *  2) alanı (m²) ve maliyeti hesaplar,
   *  3) (opsiyonel) stoktan düşer,
   *  4) (opsiyonel) müşteri carisine borç (DEBIT) yazar.
   */
  async create(
    dto: CreateProcessingJobDto,
    processedById: string,
  ): Promise<ProcessingJob> {
    const plate = await this.platesService.findOne(dto.plateId);

    const widthMm = dto.widthMm ?? plate.widthMm;
    const heightMm = dto.heightMm ?? plate.heightMm;
    const quantity = dto.quantity ?? 1;

    const ratePerM2 = await this.resolveRate(dto);
    const areaM2 = totalAreaM2(widthMm, heightMm, quantity);
    const laborCost = roundMoney(areaM2 * ratePerM2);
    const extraCost = roundMoney(dto.extraCost ?? 0);
    const totalCost = roundMoney(laborCost + extraCost);

    const willBill = (dto.bill ?? true) && !!dto.customerId;
    if ((dto.bill ?? true) && !dto.customerId && totalCost > 0) {
      // Faturalanacaksa müşteri zorunludur.
      throw new BadRequestException(
        'İşleme faturalanacaksa bir müşteri (customerId) seçilmelidir.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const job = manager.create(ProcessingJob, {
        plateId: plate.id,
        customerId: dto.customerId,
        processedById,
        ratePresetId: dto.ratePresetId,
        processedAt: dto.processedAt ? new Date(dto.processedAt) : new Date(),
        quantity,
        widthMm,
        heightMm,
        areaM2,
        ratePerM2,
        laborCost,
        extraCost,
        totalCost,
        isBilled: willBill,
        note: dto.note,
      });
      const saved = await manager.save(job);

      // Stoktan düş (varsayılan açık).
      if (dto.consumeStock ?? true) {
        await this.platesService.adjustStock(plate.id, -quantity, manager);
      }

      // Cariye borç yaz.
      if (willBill && totalCost > 0) {
        await this.accountService.applyDebit(manager, {
          customerId: dto.customerId!,
          amount: totalCost,
          sourceType: LedgerSourceType.PROCESSING,
          sourceId: saved.id,
          description: `İşleme: ${plate.name} (${areaM2.toFixed(4)} m²)`,
          occurredAt: saved.processedAt,
        });
      }

      return saved;
    });
  }

  async findAll(
    query: QueryProcessingJobDto,
  ): Promise<PaginatedResult<ProcessingJob>> {
    const where: FindOptionsWhere<ProcessingJob> = {};
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.plateId) {
      where.plateId = query.plateId;
    }
    if (query.from && query.to) {
      where.processedAt = Between(new Date(query.from), new Date(query.to));
    }

    const [items, total] = await this.jobsRepo.findAndCount({
      where,
      order: { processedAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<ProcessingJob> {
    const job = await this.jobsRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException('İşleme kaydı bulunamadı.');
    }
    return job;
  }

  /**
   * m² birim fiyatını öncelik sırasına göre belirler:
   *   override (dinamik) > şablon (preset) > sistem varsayılanı.
   */
  private async resolveRate(dto: CreateProcessingJobDto): Promise<number> {
    if (dto.overrideRatePerM2 != null) {
      return dto.overrideRatePerM2;
    }
    if (dto.ratePresetId) {
      const preset = await this.ratesService.findOne(dto.ratePresetId);
      return Number(preset.ratePerM2);
    }
    const fallback = await this.ratesService.findDefault();
    return fallback
      ? Number(fallback.ratePerM2)
      : this.business.defaultRatePerM2;
  }
}

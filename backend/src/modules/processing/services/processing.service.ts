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
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../common/dto/paginated-result';
import { roundMoney, round, totalAreaM2 } from '../../../common/utils/area.util';
import { PlatesService } from '../../materials/services/plates.service';
import { WarehousesService } from '../../warehouses/warehouses.service';
import { CurrencyService } from '../../currency/currency.service';
import { CustomerAccountService } from '../../customers/services/customer-account.service';
import { MaterialPlate } from '../../materials/entities/material-plate.entity';
import { ProcessingJob } from '../entities/processing-job.entity';
import { CreateProcessingJobDto } from '../dto/create-processing-job.dto';
import { QueryProcessingJobDto } from '../dto/query-processing-job.dto';
import { ProcessingRatesService } from './processing-rates.service';

@Injectable()
export class ProcessingService {
  private readonly business: BusinessConfig;
  private readonly defaultWarehouseCode: string;

  constructor(
    @InjectRepository(ProcessingJob)
    private readonly jobsRepo: Repository<ProcessingJob>,
    private readonly platesService: PlatesService,
    private readonly ratesService: ProcessingRatesService,
    private readonly accountService: CustomerAccountService,
    private readonly warehousesService: WarehousesService,
    private readonly currencyService: CurrencyService,
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.business = configService.get<BusinessConfig>('business')!;
    this.defaultWarehouseCode =
      configService.get<string>('business.defaultWarehouseCode') ?? 'MERKEZ';
  }

  /**
   * İşleme kaydı oluşturur. TEK transaction içinde:
   *  1) faturalama birimini ve etkin birim fiyatını çözer,
   *  2) ölçü miktarını (m²/metre/adet) ve maliyeti hesaplar (+ baz para çevrimi),
   *  3) (opsiyonel) depodan stok düşer,
   *  4) (opsiyonel) müşteri carisine baz tutarda borç (DEBIT) yazar.
   */
  async create(
    dto: CreateProcessingJobDto,
    processedById: string,
  ): Promise<ProcessingJob> {
    const plate = await this.platesService.findOne(dto.plateId);
    const quantity = dto.quantity ?? 1;
    const billingUnit =
      dto.billingUnit ?? plate.measurementType ?? MeasurementType.AREA;

    const ratePerUnit = await this.resolveRate(dto);
    const { quantityValue, widthMm, heightMm, lengthM } = this.computeQuantity(
      billingUnit,
      dto,
      plate,
      quantity,
    );

    const laborCost = roundMoney(quantityValue * ratePerUnit);
    const extraCost = roundMoney(dto.extraCost ?? 0);
    const totalCost = roundMoney(laborCost + extraCost);

    const currency = (dto.currency ?? this.business.defaultCurrency).toUpperCase();
    const processedAt = dto.processedAt ? new Date(dto.processedAt) : new Date();
    const { amount: baseTotalCost, rate: exchangeRate } =
      await this.currencyService.convert(
        totalCost,
        currency,
        this.currencyService.baseCurrency,
        processedAt,
      );

    const willBill = (dto.bill ?? true) && !!dto.customerId;
    if ((dto.bill ?? true) && !dto.customerId && totalCost > 0) {
      throw new BadRequestException(
        'İşleme faturalanacaksa bir müşteri (customerId) seçilmelidir.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const warehouse =
        dto.consumeStock ?? true
          ? dto.warehouseId
            ? await this.warehousesService.findOne(dto.warehouseId)
            : await this.warehousesService.resolveDefault(
                this.defaultWarehouseCode,
                manager,
              )
          : null;

      const job = manager.create(ProcessingJob, {
        plateId: plate.id,
        customerId: dto.customerId,
        processedById,
        warehouseId: warehouse?.id,
        ratePresetId: dto.ratePresetId,
        processedAt,
        quantity,
        widthMm,
        heightMm,
        lengthM,
        billingUnit,
        quantityValue,
        ratePerUnit,
        laborCost,
        extraCost,
        totalCost,
        currency,
        exchangeRate,
        baseTotalCost,
        isBilled: willBill,
        note: dto.note,
      });
      const saved = await manager.save(job);

      if ((dto.consumeStock ?? true) && warehouse) {
        await this.platesService.adjustStock(
          plate.id,
          warehouse.id,
          -quantity,
          null,
          manager,
        );
      }

      if (willBill && baseTotalCost > 0) {
        await this.accountService.applyDebit(manager, {
          customerId: dto.customerId!,
          amount: baseTotalCost,
          sourceType: LedgerSourceType.PROCESSING,
          sourceId: saved.id,
          description: `İşleme: ${plate.name} (${quantityValue} ${this.unitLabel(billingUnit)})`,
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
   * Faturalanan ölçü miktarını birime göre hesaplar.
   * AREA→m² (en×boy×adet), LENGTH→metre (uzunluk×adet), PIECE/WEIGHT→adet/miktar.
   */
  private computeQuantity(
    billingUnit: MeasurementType,
    dto: CreateProcessingJobDto,
    plate: MaterialPlate,
    quantity: number,
  ): {
    quantityValue: number;
    widthMm?: number | null;
    heightMm?: number | null;
    lengthM?: number | null;
  } {
    switch (billingUnit) {
      case MeasurementType.AREA: {
        const widthMm = dto.widthMm ?? plate.widthMm ?? null;
        const heightMm = dto.heightMm ?? plate.heightMm ?? null;
        if (widthMm == null || heightMm == null) {
          throw new BadRequestException(
            'm² hesabı için en ve boy (kalemde veya işlemde) tanımlı olmalıdır.',
          );
        }
        return {
          quantityValue: totalAreaM2(Number(widthMm), Number(heightMm), quantity),
          widthMm,
          heightMm,
        };
      }
      case MeasurementType.LENGTH: {
        if (dto.lengthMeters == null) {
          throw new BadRequestException(
            'Metre bazlı işleme için lengthMeters (metre) zorunludur.',
          );
        }
        return {
          quantityValue: round(dto.lengthMeters * quantity, 4),
          lengthM: dto.lengthMeters,
        };
      }
      default:
        // PIECE / WEIGHT → doğrudan adet/miktar.
        return { quantityValue: round(quantity, 4) };
    }
  }

  /** Birim fiyatı öncelik sırasına göre belirler: override > şablon > varsayılan. */
  private async resolveRate(dto: CreateProcessingJobDto): Promise<number> {
    if (dto.overrideRatePerUnit != null) {
      return dto.overrideRatePerUnit;
    }
    if (dto.ratePresetId) {
      const preset = await this.ratesService.findOne(dto.ratePresetId);
      return Number(preset.ratePerUnit);
    }
    const fallback = await this.ratesService.findDefault();
    return fallback
      ? Number(fallback.ratePerUnit)
      : this.business.defaultRatePerM2;
  }

  private unitLabel(unit: MeasurementType): string {
    switch (unit) {
      case MeasurementType.AREA:
        return 'm²';
      case MeasurementType.LENGTH:
        return 'm';
      case MeasurementType.WEIGHT:
        return 'kg';
      default:
        return 'adet';
    }
  }
}

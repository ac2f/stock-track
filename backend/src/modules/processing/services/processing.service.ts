import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';
import { BusinessConfig } from '../../../config/configuration';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { ProcessingStatus } from '../../../common/enums/processing-status.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../common/dto/paginated-result';
import { roundMoney } from '../../../common/utils/area.util';
import { computeQuantityValue } from '../processing-calc.util';
import { PlatesService } from '../../materials/services/plates.service';
import { WarehousesService } from '../../warehouses/warehouses.service';
import { CurrencyService } from '../../currency/currency.service';
import { CustomerAccountService } from '../../customers/services/customer-account.service';
import { MaterialPlate } from '../../materials/entities/material-plate.entity';
import { ProcessingJob } from '../entities/processing-job.entity';
import { CreateProcessingJobDto } from '../dto/create-processing-job.dto';
import { QueryProcessingJobDto } from '../dto/query-processing-job.dto';
import { ProcessingRatesService } from './processing-rates.service';

export interface ProcessingQueueGroup {
  machineId: string | null;
  machineName: string;
  jobs: ProcessingJob[];
}

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
   * İşleme kaydı oluşturur (kendi transaction'ında). Teklif dönüşümü gibi dış bir
   * transaction içinden çağrılmak istenirse `persist()` doğrudan kullanılabilir.
   */
  async create(
    dto: CreateProcessingJobDto,
    processedById: string,
  ): Promise<ProcessingJob> {
    return this.dataSource.transaction((manager) =>
      this.persist(manager, dto, processedById),
    );
  }

  /**
   * İşleme kaydının çekirdek mantığı — verilen EntityManager içinde çalışır:
   *  1) faturalama birimini ve etkin birim fiyatını çözer,
   *  2) ölçü miktarını (m²/metre/adet) ve maliyeti hesaplar (+ baz para çevrimi),
   *  3) ANINDA faturalama ise stok düşer + cariye DEBIT yazar,
   *  4) TAMAMLANINCA faturalama ise (billOnCompletion) iş PENDING kaydedilir;
   *     stok/borç COMPLETED geçişinde uygulanır.
   */
  async persist(
    manager: EntityManager,
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

    const billIntent = dto.bill ?? true;
    const consumeIntent = dto.consumeStock ?? true;
    const willBillIntent = billIntent && !!dto.customerId;
    if (billIntent && !dto.customerId && totalCost > 0) {
      throw new BadRequestException(
        'İşleme faturalanacaksa bir müşteri (customerId) seçilmelidir.',
      );
    }

    // Faturalama tamamlanmaya ertelendi mi? (sadece faturalanacak işlerde anlamlı)
    const deferred = billIntent && (dto.billOnCompletion ?? false);
    const status =
      dto.status ??
      (deferred ? ProcessingStatus.PENDING : ProcessingStatus.COMPLETED);

    const warehouse = consumeIntent
      ? dto.warehouseId
        ? await this.warehousesService.findOne(dto.warehouseId)
        : await this.warehousesService.resolveDefault(
            this.defaultWarehouseCode,
            manager,
          )
      : null;

    // Anında etkiler yalnızca erteleme YOKSA uygulanır.
    const consumeNow = !deferred && consumeIntent && !!warehouse;
    const billNow = !deferred && willBillIntent && baseTotalCost > 0;

    const job = manager.create(ProcessingJob, {
      plateId: plate.id,
      customerId: dto.customerId,
      processedById,
      warehouseId: warehouse?.id,
      machineId: dto.machineId ?? null,
      ratePresetId: dto.ratePresetId,
      status,
      processedAt,
      completedAt: status === ProcessingStatus.COMPLETED ? processedAt : null,
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
      isBilled: billNow,
      billOnCompletion: deferred,
      stockConsumed: consumeNow,
      consumedQuantity: consumeNow ? quantity : 0,
      quoteId: dto.quoteId ?? null,
      note: dto.note,
    });
    const saved = await manager.save(job);

    if (consumeNow) {
      // Tabaka (AREA) işinde kalan boy düşülür; değilse adet. Düşülen boy iptal
      // için saklanır.
      const cut = await this.platesService.consume({
        plateId: plate.id,
        warehouseId: warehouse!.id,
        quantity,
        consumedHeightMm:
          billingUnit === MeasurementType.AREA ? heightMm : null,
        areaM2: billingUnit === MeasurementType.AREA ? quantityValue : null,
        manager,
      });
      if (cut > 0) {
        saved.consumedHeightMm = cut;
        await manager.save(saved);
      }
    }

    if (billNow) {
      await this.accountService.applyDebit(manager, {
        customerId: dto.customerId!,
        amount: baseTotalCost,
        sourceType: LedgerSourceType.PROCESSING,
        sourceId: saved.id,
        description: this.processingDescription(
          plate,
          quantityValue,
          billingUnit,
          dto.note,
        ),
        occurredAt: saved.processedAt,
      });
    }

    return saved;
  }

  /**
   * Üretim kuyruğunda durum değiştirir.
   *  - COMPLETED → (idempotent) henüz düşülmemiş stoğu düşer; ertelenmiş faturayı
   *    (billOnCompletion) cariye DEBIT olarak yazar; completedAt damgalar.
   *  - CANCELLED → tüketilen stoğu iade eder; yazılmış borcu CREDIT ile geri alır.
   */
  async setStatus(
    id: string,
    status: ProcessingStatus,
    opts: { finalAmount?: number } = {},
  ): Promise<ProcessingJob> {
    return this.dataSource.transaction(async (manager) => {
      const job = await manager.findOne(ProcessingJob, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });
      if (!job) {
        throw new NotFoundException('İşleme kaydı bulunamadı.');
      }

      if (status === ProcessingStatus.COMPLETED) {
        // Plaka (malzeme türü + ad) ekstre açıklaması için yüklenir.
        const plate = await manager.findOne(MaterialPlate, {
          where: { id: job.plateId },
          withDeleted: true,
        });
        // İş bitiminde pazarlıkla belirlenen nihai tutar verildiyse, işin
        // ücretini güncelle; faturalama bu yeni tutar üzerinden yapılır.
        if (opts.finalAmount != null) {
          const final = roundMoney(opts.finalAmount);
          job.totalCost = final;
          job.laborCost = roundMoney(
            Math.max(0, final - Number(job.extraCost)),
          );
          const conv = await this.currencyService.convert(
            final,
            job.currency,
            this.currencyService.baseCurrency,
            new Date(),
          );
          job.baseTotalCost = conv.amount;
          job.exchangeRate = conv.rate;
        }
        if (!job.stockConsumed && job.warehouseId) {
          // Karar PLAKA tipine göre (job.billingUnit'e değil): TABAKA (AREA)
          // malzemede stok her zaman m²/ebattan düşülür → "Yetersiz stok (adet)"
          // hatası oluşmaz. AREA dışı malzemede mevcut kadar adet düşülür.
          if (plate?.measurementType === MeasurementType.AREA) {
            const cut = await this.platesService.consume({
              plateId: job.plateId,
              warehouseId: job.warehouseId,
              quantity: Number(job.quantity),
              consumedHeightMm: job.heightMm != null ? Number(job.heightMm) : null,
              areaM2: job.quantityValue != null ? Number(job.quantityValue) : null,
              manager,
            });
            job.consumedHeightMm = cut || null;
            job.consumedQuantity = 0;
          } else {
            // İşletme stoğundan mevcut kadarını düş — yetersizse tamamlamayı
            // engelleme (örn. konsinye plakada işletme stoğu 0 olabilir).
            const available = plate
              ? Math.max(0, Number(plate.quantityInStock))
              : 0;
            const consume = Math.min(Number(job.quantity), available);
            if (consume > 0) {
              await this.platesService.adjustStock(
                job.plateId,
                job.warehouseId,
                -consume,
                null,
                manager,
              );
            }
            job.consumedQuantity = consume;
          }
          job.stockConsumed = true;
        }
        if (
          !job.isBilled &&
          job.billOnCompletion &&
          job.customerId &&
          Number(job.baseTotalCost) > 0
        ) {
          await this.accountService.applyDebit(manager, {
            customerId: job.customerId,
            amount: Number(job.baseTotalCost),
            sourceType: LedgerSourceType.PROCESSING,
            sourceId: job.id,
            description: this.processingDescription(
              plate,
              Number(job.quantityValue),
              job.billingUnit,
              job.note,
            ),
            occurredAt: new Date(),
          });
          job.isBilled = true;
        }
        if (!job.completedAt) {
          job.completedAt = new Date();
        }
      } else if (status === ProcessingStatus.CANCELLED) {
        if (job.stockConsumed && job.warehouseId) {
          if (job.consumedHeightMm && Number(job.consumedHeightMm) > 0) {
            // Tabaka işi: düşülen boyu geri ekle (best-effort).
            await this.platesService.restoreSheetHeight(
              job.plateId,
              Number(job.consumedHeightMm),
              manager,
            );
            job.consumedHeightMm = null;
          } else {
            const refund =
              Number(job.consumedQuantity) || Number(job.quantity);
            if (refund > 0) {
              await this.platesService.adjustStock(
                job.plateId,
                job.warehouseId,
                refund,
                null,
                manager,
              );
            }
          }
          job.consumedQuantity = 0;
          job.stockConsumed = false;
        }
        if (job.isBilled && job.customerId && Number(job.baseTotalCost) > 0) {
          await this.accountService.applyCredit(manager, {
            customerId: job.customerId,
            amount: Number(job.baseTotalCost),
            sourceType: LedgerSourceType.PROCESSING,
            sourceId: job.id,
            description: `İşleme iptali #${job.id.slice(0, 8)}`,
            occurredAt: new Date(),
          });
          job.isBilled = false;
        }
      }

      job.status = status;
      return manager.save(job);
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
    if (query.machineId) {
      where.machineId = query.machineId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.from && query.to) {
      // `to` gün sonunu kapsasın — aksi halde bugün tamamlanan işler (saat > 00:00)
      // aralık dışında kalıp geçmiş listesinde görünmüyordu.
      const toEnd = new Date(query.to);
      toEnd.setHours(23, 59, 59, 999);
      where.processedAt = Between(new Date(query.from), toEnd);
    }

    const [items, total] = await this.jobsRepo.findAndCount({
      where,
      order: { processedAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
      // Müşteri ilişkisi eager değil → geçmiş listesinde adın "Müşterisiz"
      // görünmemesi için açıkça yüklenir.
      relations: { customer: true },
      // Tükenip soft-delete olmuş plakanın adı geçmişte de görünsün.
      withDeleted: true,
    });
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  /**
   * Üretim kuyruğu: aktif (PENDING/IN_PROGRESS) işleri makineye göre gruplar.
   * `status` verilirse o duruma filtreler; `machineId` ile tek makine.
   */
  async queue(query: QueryProcessingJobDto): Promise<ProcessingQueueGroup[]> {
    const statuses = query.status
      ? [query.status]
      : [ProcessingStatus.PENDING, ProcessingStatus.IN_PROGRESS];

    const qb = this.jobsRepo
      .createQueryBuilder('j')
      // withDeleted: tabaka tükenip soft-delete olsa bile plaka adı görünsün
      // (aksi halde tamamlanan/bekleyen işin adı "—" oluyordu).
      .withDeleted()
      .leftJoinAndSelect('j.machine', 'machine')
      .leftJoinAndSelect('j.plate', 'plate')
      .leftJoinAndSelect('j.customer', 'customer')
      .where('j.status IN (:...statuses)', { statuses })
      .andWhere('j.deleted_at IS NULL')
      .orderBy('j.processed_at', 'ASC');
    if (query.machineId) {
      qb.andWhere('j.machine_id = :machineId', { machineId: query.machineId });
    }
    const jobs = await qb.getMany();

    const groups = new Map<string, ProcessingQueueGroup>();
    for (const job of jobs) {
      const key = job.machineId ?? 'unassigned';
      if (!groups.has(key)) {
        groups.set(key, {
          machineId: job.machineId ?? null,
          machineName: job.machine?.name ?? 'Atanmamış',
          jobs: [],
        });
      }
      groups.get(key)!.jobs.push(job);
    }
    return Array.from(groups.values());
  }

  async findOne(id: string): Promise<ProcessingJob> {
    const job = await this.jobsRepo.findOne({
      where: { id },
      withDeleted: true, // tükenmiş plakanın adı fiş/PDF'te de görünsün
    });
    if (!job) {
      throw new NotFoundException('İşleme kaydı bulunamadı.');
    }
    return job;
  }

  /**
   * İşleme kaydının düzenlenebilir alanlarını günceller: işlenme/tamamlanma
   * tarihleri ve not. Tutar/stok/faturalama bu uçtan değiştirilmez.
   */
  async update(
    id: string,
    dto: { processedAt?: string; completedAt?: string; note?: string },
  ): Promise<ProcessingJob> {
    return this.dataSource.transaction(async (manager) => {
      const job = await manager.findOne(ProcessingJob, {
        where: { id },
        withDeleted: true,
        loadEagerRelations: false,
      });
      if (!job) {
        throw new NotFoundException('İşleme kaydı bulunamadı.');
      }
      if (dto.processedAt !== undefined) {
        job.processedAt = new Date(dto.processedAt);
      }
      if (dto.completedAt !== undefined) {
        job.completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
      }
      if (dto.note !== undefined) {
        job.note = dto.note;
      }
      const saved = await manager.save(job);

      // #1 Ekstre yansıması: işleme faturalanmışsa, bağlı cari hareketin
      // tarihini (ve sırasını) düzenlenen tarihe taşı; bakiyeleri yeniden
      // hesapla ki ekstre geçmiş işlemeyi güncel göster
      if (job.isBilled && job.customerId) {
        const ledgerDate = job.completedAt ?? job.processedAt;
        await this.accountService.updateBySource(
          manager,
          LedgerSourceType.PROCESSING,
          job.id,
          { occurredAt: ledgerDate },
        );
        await this.accountService.recomputeBalances(manager, job.customerId);
      }
      return saved;
    });
  }

  /**
   * #2 Geçmiş bir işleme kaydını TAMAMEN siler:
   *  - tüketilen stoğu iade eder (tabaka boyu / adet),
   *  - bağlı cari hareketini defterden kaldırır (ekstreden düşer),
   *  - müşteri bakiyesini yeniden hesaplar,
   *  - işi fiziksel olarak siler (hard delete) — geçmişte de görünmez.
   */
  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const job = await manager.findOne(ProcessingJob, {
        where: { id },
        withDeleted: true,
        loadEagerRelations: false,
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) {
        throw new NotFoundException('İşleme kaydı bulunamadı.');
      }
      const customerId = job.customerId;
      await this.reverseJobEffects(manager, job);
      await manager.delete(ProcessingJob, { id: job.id });
      // Cari hareketi kaldırıldıysa bakiyeyi yeniden hesapla (ekstreden düşsün).
      if (customerId) {
        await this.accountService.recomputeBalances(manager, customerId);
      }
    });
  }

  /**
   * Bir işin cari etkisini geri alır (silme/teklif iptali için ortak).
   * STOK İADE EDİLMEZ: silinen iş, tüketilmiş malzemeyi stoğa geri eklemez
   * (kullanıcı talebi) — aksi halde geri eklenen miktarın sahipliği işletmeye
   * geçip konsinye takibini bozuyordu. Yalnızca cari hareket defterden kaldırılır
   * → borç ekstreden düşer. Cari bakiyeyi YENİDEN HESAPLAMAZ — çağıran yapar.
   */
  private async reverseJobEffects(
    manager: EntityManager,
    job: ProcessingJob,
  ): Promise<void> {
    if (job.customerId) {
      await this.accountService.removeBySource(
        manager,
        LedgerSourceType.PROCESSING,
        job.id,
      );
    }
  }

  /**
   * #2 Bir teklife ait tüm işleme kayıtlarını siler (teklif silinirken çağrılır).
   * Stok iade + cari hareket kaldırma + bakiye yeniden hesaplama içerir.
   */
  async removeByQuote(manager: EntityManager, quoteId: string): Promise<void> {
    const jobs = await manager.find(ProcessingJob, {
      where: { quoteId },
      withDeleted: true,
      loadEagerRelations: false,
    });
    const affectedCustomers = new Set<string>();
    for (const job of jobs) {
      await this.reverseJobEffects(manager, job);
      if (job.customerId) affectedCustomers.add(job.customerId);
    }
    if (jobs.length > 0) {
      await manager.delete(ProcessingJob, { id: In(jobs.map((j) => j.id)) });
    }
    for (const customerId of affectedCustomers) {
      await this.accountService.recomputeBalances(manager, customerId);
    }
  }

  /**
   * Faturalanan ölçü miktarını birime göre hesaplar; saklanan en/boy/uzunluğu döner.
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
    const widthMm =
      billingUnit === MeasurementType.AREA
        ? dto.widthMm ?? plate.widthMm ?? null
        : null;
    const heightMm =
      billingUnit === MeasurementType.AREA
        ? dto.heightMm ?? plate.heightMm ?? null
        : null;
    const quantityValue = computeQuantityValue({
      billingUnit,
      quantity,
      widthMm,
      heightMm,
      lengthMeters: dto.lengthMeters,
    });
    return {
      quantityValue,
      widthMm,
      heightMm,
      lengthM:
        billingUnit === MeasurementType.LENGTH ? dto.lengthMeters ?? null : null,
    };
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

  /**
   * Cari ekstre için işleme açıklaması: malzeme TÜRÜ (Pleksi/Kompozit…) + plaka
   * adı + ölçü, varsa not (teklif notu dahil). Örn.
   * "İşleme (Pleksi): Şeffaf Levha 1,5 m² — Teklif TKF-2026-0001: ivedi".
   */
  private processingDescription(
    plate: { name?: string; template?: { category?: { name?: string } } } | null,
    quantityValue: number,
    billingUnit: MeasurementType,
    note?: string | null,
  ): string {
    const type = plate?.template?.category?.name;
    const head = type ? `İşleme (${type}): ` : 'İşleme: ';
    const name = plate?.name ?? 'Malzeme';
    const fmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
    const noteStr = note?.trim() ? ` — ${note.trim()}` : '';
    return `${head}${name} ${fmt.format(quantityValue)} ${this.unitLabel(billingUnit)}${noteStr}`;
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

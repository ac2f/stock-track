import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import {
  QuoteLineKind,
  QuoteStatus,
} from '../../../common/enums/quote-status.enum';
import { SaleStockSource } from '../../../common/enums/sale-source.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../common/dto/paginated-result';
import { roundMoney } from '../../../common/utils/area.util';
import { lineTotalOf } from '../../sales/sale-calc.util';
import { computeQuantityValue } from '../../processing/processing-calc.util';
import { PlatesService } from '../../materials/services/plates.service';
import { CurrencyService } from '../../currency/currency.service';
import { CustomersService } from '../../customers/services/customers.service';
import { SalesService } from '../../sales/sales.service';
import { ProcessingService } from '../../processing/services/processing.service';
import { CreateSaleDto } from '../../sales/dto/create-sale.dto';
import { CreateProcessingJobDto } from '../../processing/dto/create-processing-job.dto';
import { Quote } from '../entities/quote.entity';
import { QuoteItem } from '../entities/quote-item.entity';
import { CreateQuoteDto, QuoteItemDto } from '../dto/create-quote.dto';
import { QueryQuoteDto } from '../dto/query-quote.dto';

export interface QuoteConversionResult {
  quote: Quote;
  saleId?: string;
  processingJobIds: string[];
}

@Injectable()
export class QuotesService {
  private readonly defaultCurrency: string;

  constructor(
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(QuoteItem)
    private readonly itemsRepo: Repository<QuoteItem>,
    private readonly platesService: PlatesService,
    private readonly currencyService: CurrencyService,
    private readonly customersService: CustomersService,
    private readonly salesService: SalesService,
    private readonly processingService: ProcessingService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.defaultCurrency =
      configService.get<string>('business.defaultCurrency') ?? 'TRY';
  }

  /** Teklif oluşturur (yalnızca hesap; cari/stok hareketi yok). */
  async create(dto: CreateQuoteDto): Promise<Quote> {
    const built = await this.buildQuoteData(dto);
    const quote = this.quotesRepo.create({
      ...built.fields,
      quoteNo: await this.nextQuoteNo(),
      status: QuoteStatus.DRAFT,
      items: built.items,
    });
    return this.quotesRepo.save(quote);
  }

  /** Teklifi tümüyle yeniden yazar (DRAFT/SENT/REJECTED iken). */
  async update(id: string, dto: CreateQuoteDto): Promise<Quote> {
    const quote = await this.findOne(id);
    if (
      quote.status === QuoteStatus.CONVERTED ||
      quote.status === QuoteStatus.ACCEPTED
    ) {
      throw new BadRequestException(
        'Kabul edilmiş veya dönüştürülmüş teklif düzenlenemez.',
      );
    }
    const built = await this.buildQuoteData(dto);
    return this.dataSource.transaction(async (manager) => {
      await manager.delete(QuoteItem, { quoteId: quote.id });
      Object.assign(quote, built.fields, { items: built.items });
      return manager.save(quote);
    });
  }

  /**
   * Teklif geçmişi: tarih aralığı, müşteri ve malzeme (plaka) ile filtrelenir.
   * Karara bağlanmamış (DRAFT/SENT) teklifler daima en üstte, ardından tarihe
   * göre yeni→eski. Hiçbir filtre verilmezse son 1 haftalık kayıtlar gösterilir.
   */
  async findAll(query: QueryQuoteDto): Promise<PaginatedResult<Quote>> {
    // Sayfalama+sıralama yalnızca temel `quotes` tablosunda (join yok) yapılır —
    // ham CASE sıralaması join'lerle çakışmasın diye. İlişkiler (buyerCustomer,
    // items) ikinci adımda eager yüklenip sıra korunur.
    const qb = this.quotesRepo.createQueryBuilder('quote');

    if (query.buyerCustomerId) {
      qb.andWhere('quote.buyer_customer_id = :buyerCustomerId', {
        buyerCustomerId: query.buyerCustomerId,
      });
    }
    if (query.status) {
      qb.andWhere('quote.status = :status', { status: query.status });
    }
    if (query.plateId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM quote_items qi
                 WHERE qi.quote_id = quote.id AND qi.plate_id = :plateId
                   AND qi.deleted_at IS NULL)`,
        { plateId: query.plateId },
      );
    }
    if (query.categoryId) {
      // Malzemeyi TÜR (kategori) olarak sorgula: kalemin plakası→şablon→kategori.
      qb.andWhere(
        `EXISTS (SELECT 1 FROM quote_items qi
                   JOIN material_plates mp ON mp.id = qi.plate_id
                   JOIN material_templates mt ON mt.id = mp.template_id
                  WHERE qi.quote_id = quote.id AND mt.category_id = :categoryId
                    AND qi.deleted_at IS NULL)`,
        { categoryId: query.categoryId },
      );
    }
    if (query.from) qb.andWhere('quote.created_at >= :from', { from: query.from });
    if (query.to) qb.andWhere('quote.created_at <= :to', { to: query.to });

    const hasFilter = !!(
      query.buyerCustomerId ||
      query.status ||
      query.plateId ||
      query.categoryId ||
      query.from ||
      query.to
    );
    if (!hasFilter) {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      qb.andWhere('quote.created_at >= :weekAgo', { weekAgo });
    }

    qb.orderBy(
      `CASE WHEN quote.status IN ('draft','sent') THEN 0 ELSE 1 END`,
      'ASC',
    )
      .addOrderBy('quote.created_at', 'DESC')
      .skip(query.skip)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();

    // items eager olsa da QueryBuilder otomatik yüklemez; sırayı koruyarak ekle.
    const ids = rows.map((r) => r.id);
    const full = ids.length
      ? await this.quotesRepo.find({ where: { id: In(ids) } })
      : [];
    const byId = new Map(full.map((q) => [q.id, q]));
    const ordered = rows.map((r) => byId.get(r.id) ?? r);

    return buildPaginatedResult(ordered, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Quote> {
    const quote = await this.quotesRepo.findOne({ where: { id } });
    if (!quote) {
      throw new NotFoundException('Teklif bulunamadı.');
    }
    return quote;
  }

  /** Durum değiştirir (CONVERTED hariç; o yalnızca convert ile ayarlanır). */
  async setStatus(id: string, status: QuoteStatus): Promise<Quote> {
    const quote = await this.findOne(id);
    if (quote.status === QuoteStatus.CONVERTED) {
      throw new BadRequestException('Dönüştürülmüş teklif değiştirilemez.');
    }
    if (status === QuoteStatus.CONVERTED) {
      throw new BadRequestException(
        'CONVERTED durumu yalnızca dönüştürme (convert) ile ayarlanır.',
      );
    }
    quote.status = status;
    return this.quotesRepo.save(quote);
  }

  /**
   * ACCEPTED teklifi gerçeğe döker. TEK transaction içinde:
   *  - SALE kalemleri tek bir Satış kaydına (SalesService.persist) → alıcı borçlanır,
   *  - PROCESSING kalemleri üretim kuyruğuna PENDING iş olarak (ProcessingService.persist,
   *    billOnCompletion=true) → tamamlanınca faturalanır.
   * Olaylar (sale.created) commit sonrası yayınlanır.
   */
  async convert(id: string, soldById: string): Promise<QuoteConversionResult> {
    const quote = await this.findOne(id);
    if (quote.status === QuoteStatus.CONVERTED) {
      throw new BadRequestException('Teklif zaten dönüştürülmüş.');
    }
    if (quote.status !== QuoteStatus.ACCEPTED) {
      throw new BadRequestException(
        'Yalnızca ACCEPTED (kabul edilmiş) teklif dönüştürülebilir.',
      );
    }

    const saleLines = quote.items.filter(
      (i) => i.lineKind === QuoteLineKind.SALE,
    );
    const procLines = quote.items.filter(
      (i) => i.lineKind === QuoteLineKind.PROCESSING,
    );

    const events: { name: string; payload: unknown }[] = [];

    const outcome = await this.dataSource.transaction(async (manager) => {
      let saleId: string | undefined;
      if (saleLines.length > 0) {
        const saleDto: CreateSaleDto = {
          buyerCustomerId: quote.buyerCustomerId,
          ownerCustomerId: quote.ownerCustomerId ?? undefined,
          warehouseId: quote.warehouseId ?? undefined,
          currency: quote.currency,
          note: `Teklif ${quote.quoteNo} → satış`,
          items: saleLines.map((l) => ({
            plateId: l.plateId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            stockSource: l.stockSource ?? SaleStockSource.BUSINESS,
            ownerSettlement: l.ownerSettlement ?? undefined,
            ownerAmount: l.ownerAmount != null ? Number(l.ownerAmount) : undefined,
            commissionPercent:
              l.commissionPercent != null
                ? Number(l.commissionPercent)
                : undefined,
          })),
        };
        const s = await this.salesService.persist(manager, saleDto, soldById);
        saleId = s.result.sale.id;
        events.push({ name: 'sale.created', payload: s.event });
      }

      const processingJobIds: string[] = [];
      for (const l of procLines) {
        const procDto: CreateProcessingJobDto = {
          plateId: l.plateId,
          customerId: quote.buyerCustomerId,
          billingUnit: l.billingUnit ?? undefined,
          quantity: Number(l.quantity),
          widthMm: l.widthMm != null ? Number(l.widthMm) : undefined,
          heightMm: l.heightMm != null ? Number(l.heightMm) : undefined,
          lengthMeters:
            l.lengthMeters != null ? Number(l.lengthMeters) : undefined,
          overrideRatePerUnit: Number(l.unitPrice),
          currency: quote.currency,
          warehouseId: quote.warehouseId ?? undefined,
          // Dönüşen işler kuyruğa PENDING girer, tamamlanınca faturalanır.
          billOnCompletion: true,
          note: `Teklif ${quote.quoteNo} → işleme`,
        };
        const job = await this.processingService.persist(
          manager,
          procDto,
          soldById,
        );
        processingJobIds.push(job.id);
      }

      await manager.update(Quote, quote.id, {
        status: QuoteStatus.CONVERTED,
        convertedSaleId: saleId ?? null,
        convertedAt: new Date(),
      });

      return { saleId, processingJobIds };
    });

    // Olaylar commit sonrası.
    for (const e of events) {
      this.eventEmitter.emit(e.name, e.payload);
    }

    quote.status = QuoteStatus.CONVERTED;
    quote.convertedSaleId = outcome.saleId ?? null;
    quote.convertedAt = new Date();
    return {
      quote,
      saleId: outcome.saleId,
      processingJobIds: outcome.processingJobIds,
    };
  }

  /** Teklif kalemlerini ve toplamlarını (işlem + baz para) hazırlar. */
  private async buildQuoteData(dto: CreateQuoteDto): Promise<{
    fields: Partial<Quote>;
    items: QuoteItem[];
  }> {
    await this.customersService.findOne(dto.buyerCustomerId);
    if (dto.ownerCustomerId) {
      await this.customersService.findOne(dto.ownerCustomerId);
    }
    const currency = (dto.currency ?? this.defaultCurrency).toUpperCase();

    const items: QuoteItem[] = [];
    for (const itemDto of dto.items) {
      const plate = await this.platesService.findOne(itemDto.plateId);
      const lineTotal = this.computeLineTotal(itemDto, plate);
      items.push(
        this.itemsRepo.create({
          lineKind: itemDto.lineKind,
          plateId: itemDto.plateId,
          description: itemDto.description,
          quantity: itemDto.quantity,
          unitPrice: itemDto.unitPrice,
          lineTotal,
          // m²/metre gösterimi ve hesabı için ölçü birimi ve ebatları (gerekirse
          // plakadan) kaleme yansıtılır — satış kaleminde de m² görünür.
          billingUnit: itemDto.billingUnit ?? plate.measurementType ?? null,
          widthMm: itemDto.widthMm ?? plate.widthMm ?? null,
          heightMm: itemDto.heightMm ?? plate.heightMm ?? null,
          lengthMeters: itemDto.lengthMeters ?? null,
          stockSource: itemDto.stockSource ?? null,
          ownerSettlement: itemDto.ownerSettlement ?? null,
          commissionPercent: itemDto.commissionPercent ?? null,
          ownerAmount: itemDto.ownerAmount ?? null,
        }),
      );
    }

    const subtotal = roundMoney(items.reduce((s, i) => s + Number(i.lineTotal), 0));
    const total = subtotal;
    const conv = await this.currencyService.convert(
      total,
      currency,
      this.currencyService.baseCurrency,
    );

    return {
      fields: {
        buyerCustomerId: dto.buyerCustomerId,
        ownerCustomerId: dto.ownerCustomerId ?? null,
        warehouseId: dto.warehouseId ?? null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        currency,
        exchangeRate: conv.rate,
        subtotal,
        total,
        baseTotal: conv.amount,
        note: dto.note,
      },
      items,
    };
  }

  /**
   * Bir teklif kaleminin satır toplamı (tahmin). Birim fiyat ölçü birimine göre
   * uygulanır: m² malzemede tabakanın (kalan) en×boy'undan hesaplanan m² ile,
   * metre/adet malzemede ilgili miktar ile çarpılır. Böylece "birim 1000" girdisi
   * tabaka değil m² (veya metre/adet) başına 1000 anlamına gelir.
   */
  private computeLineTotal(
    item: QuoteItemDto,
    plate: {
      measurementType?: MeasurementType;
      widthMm?: number | null;
      heightMm?: number | null;
    },
  ): number {
    const billingUnit =
      item.billingUnit ?? plate.measurementType ?? MeasurementType.AREA;
    const widthMm = item.widthMm ?? plate.widthMm ?? null;
    const heightMm = item.heightMm ?? plate.heightMm ?? null;
    // m² seçili ama ebat yoksa adet bazına düş (güvenli geri dönüş).
    if (
      billingUnit === MeasurementType.AREA &&
      (widthMm == null || heightMm == null)
    ) {
      return lineTotalOf(item.quantity, item.unitPrice);
    }
    const quantityValue = computeQuantityValue({
      billingUnit,
      quantity: item.quantity,
      widthMm,
      heightMm,
      lengthMeters: item.lengthMeters,
    });
    return roundMoney(quantityValue * item.unitPrice);
  }

  /** Yıllık sıralı teklif numarası (TKF-YYYY-NNNN). */
  private async nextQuoteNo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKF-${year}-`;
    const last = await this.quotesRepo
      .createQueryBuilder('q')
      .withDeleted()
      .where('q.quote_no LIKE :p', { p: `${prefix}%` })
      .orderBy('q.quote_no', 'DESC')
      .getOne();
    let seq = 1;
    if (last) {
      const n = parseInt(last.quoteNo.slice(prefix.length), 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }
}

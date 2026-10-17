import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { Customer } from '../customers/entities/customer.entity';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import { StockLevel } from '../materials/entities/stock-level.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { QuoteItem } from '../quotes/entities/quote-item.entity';
import { SettingsService } from '../settings/settings.service';
import {
  customerFolderName,
  customerHaystack,
  customerLine,
  materialHaystack,
  materialLine,
  matchesTokens,
  plateKind,
  pricingLine,
  quoteLine,
  searchTokens,
  tsvBody,
  tsvLine,
  usageLine,
} from './corel-naming.util';

const DEFAULT_CUSTOMERS = 25;
const DEFAULT_MATERIALS = 40;
const DEFAULT_QUOTES = 6;

/** Tabakadan parça kullanan teklif kalemi: plakalı ve m² ölçülen. */
function isSheetItem(item: QuoteItem): boolean {
  return !!item.plate && item.plate.measurementType === MeasurementType.AREA;
}

/**
 * CorelDRAW eklentisinin okuduğu listeler. Yanıtlar sekmeyle ayrılmış düz
 * metindir (VBA'da JSON ayrıştırıcı yok) ve tamamen ASCII'dir.
 *
 * Arama bellek içinde yapılır: Türkçe harfe duyarsız eşleşme ("dokme" →
 * "Dökme") ILIKE ile mümkün değil, liste boyları da (aktif müşteri, stoktaki
 * tabaka) bunu rahat kaldırır.
 */
@Injectable()
export class CorelService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
    @InjectRepository(StockLevel)
    private readonly stockLevelsRepo: Repository<StockLevel>,
    @InjectRepository(Quote)
    private readonly quotesRepo: Repository<Quote>,
    private readonly settings: SettingsService,
  ) {}

  /** Kesim fiyatlandırması: süre ve m² modülleri bunu okur. */
  async pricing(): Promise<string> {
    return tsvBody([pricingLine(await this.settings.getCutPricing())]);
  }

  /** Bağlantı ve anahtar denemesi; işletme adını döner. */
  async ping(): Promise<string> {
    const business = await this.settings.getBusiness();
    return tsvBody([tsvLine(['ok', business.name])]);
  }

  /**
   * Müşteriler: aramasız çağrıda son güncellenenler, aramada adı/klasörü
   * aranan metinle başlayanlar önce.
   */
  async customers(q?: string, limit = DEFAULT_CUSTOMERS): Promise<string> {
    const all = await this.customersRepo.find({
      where: { isActive: true },
      select: ['id', 'name', 'companyName', 'phone', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });
    const tokens = searchTokens(q);
    let hits = all.filter((c) => matchesTokens(customerHaystack(c), tokens));

    if (tokens.length) {
      const first = tokens[0];
      const starts = (c: Customer) =>
        customerFolderName(c.name, c.companyName)
          .toLowerCase()
          .startsWith(first) || customerHaystack(c).startsWith(first);
      hits = hits
        .map((c) => ({ c, rank: starts(c) ? 0 : 1 }))
        .sort(
          (a, b) =>
            a.rank - b.rank ||
            customerFolderName(a.c.name, a.c.companyName).localeCompare(
              customerFolderName(b.c.name, b.c.companyName),
            ),
        )
        .map((x) => x.c);
    }
    return tsvBody(hits.slice(0, limit).map(customerLine));
  }

  async customer(id: string): Promise<string> {
    const c = await this.customersRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Müşteri bulunamadı.');
    return tsvBody([customerLine(c)]);
  }

  /**
   * Stoktaki tabakalar. Müşteri verilirse önce ONUN malzemesi (konsinye)
   * gelir, ardından işletme stoğu. Yalnız tabaka (AREA) kalemler: klasör
   * adı en × boy ister.
   */
  async materials(
    customerId?: string,
    q?: string,
    limit = DEFAULT_MATERIALS,
  ): Promise<string> {
    const tokens = searchTokens(q);
    const rows: {
      plate: MaterialPlate;
      owner: 'C' | 'B';
      qty: number;
    }[] = [];

    if (customerId) {
      const owned: { plate_id: string; qty: string }[] =
        await this.stockLevelsRepo
          .createQueryBuilder('sl')
          .select('sl.plate_id', 'plate_id')
          .addSelect('SUM(sl.quantity)', 'qty')
          .where('sl.owner_customer_id = :customerId', { customerId })
          .andWhere('sl.quantity > 0')
          .groupBy('sl.plate_id')
          .getRawMany();
      if (owned.length) {
        const qtyById = new Map(owned.map((o) => [o.plate_id, Number(o.qty)]));
        const plates = await this.platesRepo.find({
          where: {
            id: In([...qtyById.keys()]),
            isActive: true,
            measurementType: MeasurementType.AREA,
          },
        });
        for (const plate of plates) {
          rows.push({ plate, owner: 'C', qty: qtyById.get(plate.id) ?? 0 });
        }
      }
    }

    const business = await this.platesRepo.find({
      where: {
        isActive: true,
        measurementType: MeasurementType.AREA,
        quantityInStock: MoreThan(0),
      },
    });
    for (const plate of business) {
      rows.push({ plate, owner: 'B', qty: Number(plate.quantityInStock) });
    }

    const hits = rows
      .filter((r) => matchesTokens(materialHaystack(r.plate), tokens))
      .sort(
        (a, b) =>
          (a.owner === b.owner ? 0 : a.owner === 'C' ? -1 : 1) ||
          plateKind(a.plate).localeCompare(plateKind(b.plate)) ||
          (a.plate.brand ?? '').localeCompare(b.plate.brand ?? '', 'tr') ||
          (a.plate.color ?? '').localeCompare(b.plate.color ?? '', 'tr') ||
          Number(a.plate.thicknessMm ?? 0) - Number(b.plate.thicknessMm ?? 0) ||
          Number(b.plate.heightMm ?? 0) - Number(a.plate.heightMm ?? 0),
      );

    return tsvBody(
      hits.slice(0, limit).map((r) => materialLine(r.plate, r.owner, r.qty)),
    );
  }

  /**
   * Müşterinin son teklifleri (yeniden eskiye). Eklenti, teklif kesildikten
   * sonra tabakanın ne kadarının kullanıldığını buradan öğrenir.
   */
  async quotes(customerId?: string, limit = DEFAULT_QUOTES): Promise<string> {
    if (!customerId) {
      throw new BadRequestException('customerId gerekli.');
    }
    const quotes = await this.quotesRepo.find({
      where: { buyerCustomerId: customerId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return tsvBody(
      quotes.map((q) =>
        quoteLine(q, (q.items ?? []).filter(isSheetItem).length),
      ),
    );
  }

  /** Bir teklifin tabaka kalemleri ve her birinden kullanılan ölçü. */
  async quoteUsage(id: string): Promise<string> {
    const quote = await this.quotesRepo.findOne({ where: { id } });
    if (!quote) throw new NotFoundException('Teklif bulunamadı.');
    return tsvBody((quote.items ?? []).filter(isSheetItem).map(usageLine));
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { QuoteLineKind, QuoteStatus } from '../../common/enums/quote-status.enum';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { Customer } from '../customers/entities/customer.entity';
import { MaterialPlate } from '../materials/entities/material-plate.entity';
import { StockLevel } from '../materials/entities/stock-level.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { QuoteItem } from '../quotes/entities/quote-item.entity';
import { FolderSettings, SettingsService } from '../settings/settings.service';
import {
  CorelJob,
  customerFolderName,
  materialOwner,
  MaterialOwner,
  ownerToken,
  sheetItemsWithPurpose,
  topLevelOwners,
  customerHaystack,
  customerLine,
  jobSheet,
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
const DEFAULT_JOBS = 50;

/**
 * Teklif sorgularında satılıp tükenen (soft-delete olan) plakalar da yüklensin:
 * tam tabaka satışında plaka stoktan silinir, ama teklif kalemi o tabakayı
 * kullanmıştır (klasörü açılmalı, ölçüsü bilinmeli). Silinmiş teklifler yine
 * de dışarıda kalır (sorgularda `deletedAt: IsNull()`).
 */
const WITH_SOLD_PLATES = { withDeleted: true } as const;

/** Tabakadan parça kullanan teklif kalemi: plakalı ve m² ölçülen. */
function isSheetItem(item: QuoteItem): boolean {
  return !!item.plate && item.plate.measurementType === MeasurementType.AREA;
}

/**
 * Takım yolu klasörü olan tabaka kalemleri: malzeme satışı (kesimsiz)
 * çıkar, aynı tabakanın satış + işleme kalemi bir kez sayılır. Eklentinin
 * "kullanılan parça" işi bunları okur.
 */
function cutSheetItems(items: QuoteItem[] | undefined): QuoteItem[] {
  return sheetItemsWithPurpose((items ?? []).filter(isSheetItem))
    .filter((x) => x.purpose === 'cut')
    .map((x) => x.item);
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

  /**
   * Bağlantı ve anahtar denemesi: `ok, işletme adı, klasör kodu`. Eklenti
   * kodu takım yolu klasörünün belirtecinde (işletme malı) kullanır.
   */
  async ping(): Promise<string> {
    const business = await this.settings.getBusiness();
    const folders = await this.settings.getFolderSettings();
    return tsvBody([tsvLine(['ok', business.name, folders.code])]);
  }

  /** Runner'ın okuduğu, bu dükkânın klasör oluşturucu ayarları. */
  folderSettings(): Promise<FolderSettings> {
    return this.settings.getFolderSettings();
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
      where: { buyerCustomerId: customerId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      take: limit,
      ...WITH_SOLD_PLATES,
    });
    return tsvBody(quotes.map((q) => quoteLine(q, cutSheetItems(q.items).length)));
  }

  /**
   * İşe dönüştürülmüş teklifler, dönüşüm sırasıyla (eskiden yeniye). Dükkân
   * bilgisayarındaki runner bunları okuyup müşteri ve takım yolu klasörlerini
   * açar. `since` dahildir; runner aynı teklifi kimliğinden tanıyıp atlar.
   */
  async jobs(since?: string, limit = DEFAULT_JOBS): Promise<CorelJob[]> {
    const folders = await this.settings.getFolderSettings();
    // Dükkânın klasör oluşturucusu kapalı: runner bu dükkâna klasör açmaz.
    if (!folders.enabled) return [];
    const where: Record<string, unknown> = { status: QuoteStatus.CONVERTED, deletedAt: IsNull() };
    if (since) where.convertedAt = MoreThanOrEqual(new Date(since));
    const quotes = await this.quotesRepo.find({
      where,
      order: { convertedAt: 'ASC', id: 'ASC' },
      take: limit,
      ...WITH_SOLD_PLATES,
    });
    return this.toJobs(quotes.filter((q) => q.convertedAt), folders);
  }

  /**
   * Klasörleri yeniden istenmiş ve o istekten sonra henüz açılmamış
   * (runner bildirmemiş) işe dönüşmüş teklifler.
   */
  async requestedJobs(limit = DEFAULT_JOBS): Promise<CorelJob[]> {
    const folders = await this.settings.getFolderSettings();
    if (!folders.enabled) return [];
    const quotes = await this.quotesRepo.find({
      where: { status: QuoteStatus.CONVERTED, foldersRequestedAt: Not(IsNull()), deletedAt: IsNull() },
      order: { foldersRequestedAt: 'ASC' },
      take: 200,
      ...WITH_SOLD_PLATES,
    });
    const pending = quotes
      .filter(
        (q) =>
          q.convertedAt &&
          (!q.foldersCreatedAt || q.foldersCreatedAt < (q.foldersRequestedAt as Date)),
      )
      .slice(0, limit);
    return this.toJobs(pending, folders);
  }

  /**
   * Teklifler → runner işleri. Her tabakanın amacı (kesim / malzeme satışı)
   * ve malzemenin sahibi: dönüşümde kaydedilen, eski kalemde stoktan ve
   * satış kaleminden yeniden bulunan.
   */
  private async toJobs(quotes: Quote[], folders: FolderSettings): Promise<CorelJob[]> {
    const sheetsOf = new Map(
      quotes.map((q) => [q.id, sheetItemsWithPurpose((q.items ?? []).filter(isSheetItem))] as const),
    );
    const all = [...sheetsOf.values()].flat().map((x) => x.item);

    // Sahibi kaydedilmemiş (eski) işleme kalemleri için stok seviyeleri.
    const unknownPlates = [
      ...new Set(all.filter((i) => !i.materialOwnerKind && i.plateId).map((i) => i.plateId!)),
    ];
    const levels = unknownPlates.length
      ? await this.stockLevelsRepo.find({ where: { plateId: In(unknownPlates) } })
      : [];
    const levelOwner = topLevelOwners(levels);

    const ownerOf = new Map<string, MaterialOwner>();
    for (const q of quotes) {
      const saleOnPlate = new Map(
        (q.items ?? [])
          .filter((i) => i.lineKind === QuoteLineKind.SALE && i.plateId)
          .map((i) => [i.plateId!, i] as const),
      );
      for (const { item } of sheetsOf.get(q.id)!) {
        ownerOf.set(
          item.id,
          item.materialOwnerKind
            ? { kind: item.materialOwnerKind, customerId: item.materialOwnerId ?? null }
            : materialOwner(item, q, saleOnPlate, levelOwner),
        );
      }
    }

    const ownerIds = [
      ...new Set([...ownerOf.values()].map((o) => o.customerId).filter((x): x is string => !!x)),
    ];
    const owners = ownerIds.length
      ? await this.customersRepo.find({
          where: { id: In(ownerIds) },
          select: ['id', 'name', 'companyName'],
          withDeleted: true,
        })
      : [];
    const ownerById = new Map(owners.map((c) => [c.id, c]));

    return quotes.map((q) => {
      const c = q.buyerCustomer;
      const label = customerLine({
        id: q.buyerCustomerId,
        name: c?.name ?? '',
        companyName: c?.companyName,
        phone: null,
      }).split('\t')[2];
      const sheets = sheetsOf.get(q.id)!.map(({ item, purpose }) => {
        const o = ownerOf.get(item.id)!;
        const cust = o.customerId ? ownerById.get(o.customerId) : undefined;
        const owner =
          o.kind === 'customer'
            ? ownerToken(cust?.name, cust?.companyName) || folders.code
            : folders.code;
        return jobSheet(item, { purpose, ownerKind: o.kind, owner });
      });
      return {
        id: q.id,
        quoteNo: q.quoteNo,
        createdAt: q.createdAt.toISOString(),
        convertedAt: q.convertedAt!.toISOString(),
        customerId: q.buyerCustomerId,
        customerFolder: customerFolderName(c?.name, c?.companyName),
        customerLabel: label,
        shopCode: folders.code,
        materialSaleFolders: folders.materialSaleFolders,
        sheets: folders.materialSaleFolders ? sheets : sheets.filter((s) => s.purpose === 'cut'),
      };
    });
  }

  /** Bir teklifin tabaka kalemleri ve her birinden kullanılan ölçü. */
  async quoteUsage(id: string): Promise<string> {
    const quote = await this.quotesRepo.findOne({ where: { id, deletedAt: IsNull() }, ...WITH_SOLD_PLATES });
    if (!quote) throw new NotFoundException('Teklif bulunamadı.');
    return tsvBody(cutSheetItems(quote.items).map(usageLine));
  }
}

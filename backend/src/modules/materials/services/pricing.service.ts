import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { PriceUnit } from '../../../common/enums/price-unit.enum';
import { roundMoney } from '../../../common/utils/area.util';
import { CurrencyService } from '../../currency/currency.service';
import { SettingsService } from '../../settings/settings.service';
import { MaterialPlate } from '../entities/material-plate.entity';
import { SupplierMaterialPrice } from '../entities/supplier-material-price.entity';

/** Bir malzemenin satış fiyatı önerisi ve piyasa karşılaştırması. */
export interface PlatePricing {
  plateId: string;
  /** Fiyatın hangi ölçü birimi üzerinden olduğu (m² / metre / adet). */
  unit: MeasurementType;
  /** Perakende (liste) birim fiyatı — GİRİLDİĞİ para biriminde. */
  retailPrice: number | null;
  /** Perakende fiyatın para birimi (TRY / USD / EUR). */
  retailCurrency: string;
  /** Perakende fiyatın baz para birimindeki karşılığı (çevrilemezse null). */
  retailPriceBase: number | null;
  /** Sistemin baz para birimi — önerilen fiyat ve piyasa bu birimdedir. */
  baseCurrency: string;
  /** Uygulanan kâr yüzdesi (plakaya özel varsa o, yoksa genel ayar). */
  markupPercent: number;
  /** Kâr eklenmiş önerilen satış birim fiyatı. */
  suggestedUnitPrice: number | null;
  /** Malzemecilerin en ucuzu — aynı ölçü birimine çevrilmiş. */
  marketCheapest: number | null;
  /** Malzemecilerin ortalaması — aynı ölçü birimine çevrilmiş. */
  marketAverage: number | null;
  /**
   * Malzemecilerin en ucuzuna göre ne kadar uygun satıyoruz (%).
   * Pozitifse müşteri piyasadan bu oranda ucuza alıyor demektir; piyasadan
   * pahalıysak null döner (indirim yoktur).
   */
  discountPercent: number | null;
  /** Konsinye (başkasının malzemesi) satışında varsayılan komisyon yüzdesi. */
  commissionPercent: number;
}

/**
 * Aynı türdeki başka bir malzemenin perakende fiyatı — fiyatı olmayan bir
 * malzemeye "aynısını uygula" demek için listelenir.
 */
export interface RetailPriceSuggestion {
  plateId: string;
  name: string;
  brand: string | null;
  color: string | null;
  thicknessMm: number | null;
  retailPrice: number;
  retailCurrency: string;
  /** Baz para birimindeki karşılığı (kur tanımsızsa null). */
  retailPriceBase: number | null;
  /** Bu malzeme ile aynı kalınlıkta mı (en yakın eşleşme önce gelsin). */
  sameThickness: boolean;
}

/**
 * Satış fiyatlandırması.
 *
 * Kural: satış birim fiyatı = perakende fiyat × (1 + kâr%). Kâr yüzdesi
 * plakaya özel girilmişse o, yoksa ayarlardaki genel oran kullanılır.
 *
 * Ayrıca malzemecilerin (tedarikçi) fiyatlarıyla karşılaştırılır: bizim
 * fiyatımız daha düşükse aradaki fark "indirim yüzdesi" olarak teklif ve cari
 * ekranlarında gösterilir.
 *
 * Tedarikçi fiyatları tabaka başına (per_plate) girilebildiği için, ölçü birimi
 * m² olan malzemelerde standart tabaka alanına bölünerek m² fiyatına çevrilir —
 * aksi halde elma ile armut karşılaştırılırdı.
 */
@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
    @InjectRepository(SupplierMaterialPrice)
    private readonly pricesRepo: Repository<SupplierMaterialPrice>,
    private readonly settings: SettingsService,
    private readonly currency: CurrencyService,
  ) {}

  async forPlate(plateId: string): Promise<PlatePricing> {
    const plate = await this.platesRepo.findOne({
      where: { id: plateId },
      relations: { template: { defaultSize: true } },
    });
    if (!plate) {
      return this.empty(plateId);
    }
    const prices = await this.pricesRepo.find({ where: { plateId } });
    const settings = await this.settings.getPricing();
    return this.compute(plate, prices, settings);
  }

  /** Birden çok plaka için tek turda fiyatlandırma (teklif ekranı listesi). */
  async forPlates(plateIds: string[]): Promise<Record<string, PlatePricing>> {
    if (!plateIds.length) return {};
    const [plates, prices, settings] = await Promise.all([
      this.platesRepo.find({
        where: plateIds.map((id) => ({ id })),
        relations: { template: { defaultSize: true } },
      }),
      this.pricesRepo
        .createQueryBuilder('p')
        .where('p.plate_id IN (:...ids)', { ids: plateIds })
        .getMany(),
      this.settings.getPricing(),
    ]);
    const byPlate = new Map<string, SupplierMaterialPrice[]>();
    for (const row of prices) {
      const list = byPlate.get(row.plateId);
      if (list) list.push(row);
      else byPlate.set(row.plateId, [row]);
    }
    const result: Record<string, PlatePricing> = {};
    for (const plate of plates) {
      result[plate.id] = await this.compute(
        plate,
        byPlate.get(plate.id) ?? [],
        settings,
      );
    }
    return result;
  }

  /**
   * Perakende fiyatı girer/günceller. Para birimi TRY (varsayılan), USD veya
   * EUR olabilir; hesaplarda baz para birimine çevrilir.
   */
  async setRetailPrice(
    plateId: string,
    input: { retailPrice: number; currency?: string; markupPercent?: number | null },
  ): Promise<PlatePricing> {
    const plate = await this.platesRepo.findOne({ where: { id: plateId } });
    if (!plate) {
      throw new NotFoundException('Stok kalemi bulunamadı.');
    }
    plate.retailPrice = input.retailPrice;
    plate.retailCurrency = (input.currency ?? this.currency.baseCurrency).toUpperCase();
    if (input.markupPercent !== undefined) {
      plate.markupPercent = input.markupPercent;
    }
    await this.platesRepo.save(plate);
    return this.forPlate(plateId);
  }

  /**
   * Aynı ÜRÜN TÜRÜNDEKİ (marka/renk farklı olabilir) fiyatı tanımlı
   * malzemeleri listeler. Kullanıcı bunlardan birinin fiyatını, fiyatı
   * olmayan malzemeye uygulayabilir.
   *
   * Aynı kalınlıktakiler önce gelir — en yakın karşılık genelde odur.
   */
  async retailSuggestions(plateId: string): Promise<RetailPriceSuggestion[]> {
    const plate = await this.platesRepo.findOne({
      where: { id: plateId },
      relations: { template: true },
    });
    if (!plate?.template) return [];

    const siblings = await this.platesRepo
      .createQueryBuilder('p')
      .innerJoin('p.template', 't')
      .where('t.category_id = :categoryId', {
        categoryId: plate.template.categoryId,
      })
      .andWhere('p.retail_price IS NOT NULL')
      .andWhere('p.id != :id', { id: plateId })
      .orderBy('p.updated_at', 'DESC')
      .take(40)
      .getMany();

    // Aynı malzemenin farklı parçaları aynı fiyatı taşır → tek satır göster.
    const seen = new Set<string>();
    const rows: RetailPriceSuggestion[] = [];
    for (const s of siblings) {
      const key = [
        s.brandId ?? '',
        s.colorId ?? '',
        s.thicknessId ?? '',
        Number(s.retailPrice),
        s.retailCurrency,
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const price = Number(s.retailPrice);
      const currency = (s.retailCurrency || this.currency.baseCurrency).toUpperCase();
      rows.push({
        plateId: s.id,
        name: s.name,
        brand: s.brand ?? null,
        color: s.color ?? null,
        thicknessMm: s.thicknessMm != null ? Number(s.thicknessMm) : null,
        retailPrice: price,
        retailCurrency: currency,
        retailPriceBase: await this.toBase(price, currency),
        sameThickness:
          s.thicknessId != null && s.thicknessId === plate.thicknessId,
      });
    }
    // Aynı kalınlıktakiler üstte.
    return rows.sort(
      (a, b) => Number(b.sameThickness) - Number(a.sameThickness),
    );
  }

  // ── Hesap ───────────────────────────────────────────────────────────
  private async compute(
    plate: MaterialPlate,
    prices: SupplierMaterialPrice[],
    settings: { saleMarkupPercent: number; consignmentCommissionPercent: number },
  ): Promise<PlatePricing> {
    const unit = (plate.measurementType ?? MeasurementType.AREA) as MeasurementType;
    const retailPrice =
      plate.retailPrice != null ? Number(plate.retailPrice) : null;
    const retailCurrency = (plate.retailCurrency || this.currency.baseCurrency)
      .toUpperCase();
    // Fiyat dövizle girilmiş olabilir; hesap her zaman baz para biriminde.
    const retailPriceBase =
      retailPrice == null ? null : await this.toBase(retailPrice, retailCurrency);
    const markupPercent =
      plate.markupPercent != null
        ? Number(plate.markupPercent)
        : Number(settings.saleMarkupPercent ?? 0);

    const suggestedUnitPrice =
      retailPriceBase == null
        ? null
        : roundMoney(retailPriceBase * (1 + markupPercent / 100));

    // Tedarikçi fiyatlarını malzemenin ölçü birimine çevir.
    const converted = prices
      .map((p) => this.toUnitPrice(Number(p.price), p.unit, unit, plate))
      .filter((v): v is number => v != null && v > 0);

    const marketCheapest = converted.length ? Math.min(...converted) : null;
    const marketAverage = converted.length
      ? roundMoney(converted.reduce((a, b) => a + b, 0) / converted.length)
      : null;

    // Piyasadan ucuz muyuz? Değilsek indirim yok (null).
    const discountPercent =
      suggestedUnitPrice != null && marketCheapest && suggestedUnitPrice < marketCheapest
        ? Math.round((1 - suggestedUnitPrice / marketCheapest) * 1000) / 10
        : null;

    return {
      plateId: plate.id,
      unit,
      retailPrice,
      retailCurrency,
      retailPriceBase,
      baseCurrency: this.currency.baseCurrency,
      markupPercent,
      suggestedUnitPrice,
      marketCheapest: marketCheapest != null ? roundMoney(marketCheapest) : null,
      marketAverage,
      discountPercent,
      commissionPercent: Number(settings.consignmentCommissionPercent ?? 0),
    };
  }

  /**
   * Tedarikçi fiyatını malzemenin ölçü birimine çevirir.
   * Tabaka başına fiyat, standart tabaka alanına bölünerek m² fiyatı olur.
   * Çevrilemiyorsa (alan bilinmiyor) null döner ve karşılaştırmaya girmez.
   */
  private toUnitPrice(
    price: number,
    from: PriceUnit,
    to: MeasurementType,
    plate: MaterialPlate,
  ): number | null {
    if (to === MeasurementType.AREA) {
      if (from === PriceUnit.PER_M2) return price;
      if (from === PriceUnit.PER_PLATE) {
        const area = this.sheetAreaM2(plate);
        return area && area > 0 ? price / area : null;
      }
      return null;
    }
    if (to === MeasurementType.LENGTH) {
      return from === PriceUnit.PER_METER ? price : null;
    }
    // Adet/kg bazlı malzemelerde tabaka başına fiyat doğrudan kullanılır.
    if (from === PriceUnit.PER_PLATE) return price;
    if (to === MeasurementType.WEIGHT && from === PriceUnit.PER_KG) return price;
    return null;
  }

  /** Tutarı baz para birimine çevirir; kur tanımlı değilse null döner. */
  private async toBase(amount: number, from: string): Promise<number | null> {
    if (from === this.currency.baseCurrency.toUpperCase()) return amount;
    try {
      return roundMoney(await this.currency.toBase(amount, from));
    } catch {
      // Kur tanımsız — satış fiyatı önerilmez, kullanıcı elle girer.
      return null;
    }
  }

  /** Standart tabaka alanı (m²) — yoksa parçanın kendi ebadına düşülür. */
  private sheetAreaM2(plate: MaterialPlate): number | null {
    const std = plate.template?.defaultSize;
    const w = Number(std?.widthMm ?? plate.widthMm);
    const h = Number(std?.heightMm ?? plate.heightMm);
    if (!w || !h) return null;
    return (w / 1000) * (h / 1000);
  }

  private empty(plateId: string): PlatePricing {
    return {
      plateId,
      unit: MeasurementType.AREA,
      retailPrice: null,
      retailCurrency: this.currency.baseCurrency,
      retailPriceBase: null,
      baseCurrency: this.currency.baseCurrency,
      markupPercent: 0,
      suggestedUnitPrice: null,
      marketCheapest: null,
      marketAverage: null,
      discountPercent: null,
      commissionPercent: 0,
    };
  }
}

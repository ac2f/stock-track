import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceUnit } from '../../../common/enums/price-unit.enum';
import { SuppliersService } from '../../suppliers/suppliers.service';
import { SupplierMaterialPrice } from '../entities/supplier-material-price.entity';
import { UpsertSupplierPriceDto } from '../dto/upsert-supplier-price.dto';
import { PlatesService } from './plates.service';

export interface PriceComparisonRow {
  supplierId: string;
  supplier: string;
  price: number;
  currency: string;
  unit: PriceUnit;
  updatedAt: Date;
}

export interface PriceComparison {
  plateId: string;
  cheapest: PriceComparisonRow | null;
  mostRecent: PriceComparisonRow | null;
  prices: PriceComparisonRow[];
}

@Injectable()
export class SupplierPricesService {
  constructor(
    @InjectRepository(SupplierMaterialPrice)
    private readonly pricesRepo: Repository<SupplierMaterialPrice>,
    private readonly platesService: PlatesService,
    private readonly suppliersService: SuppliersService,
  ) {}

  /**
   * Bir tedarikçinin bu plaka için fiyatını ekler veya günceller.
   * Her güncellemede priceUpdatedAt = şimdi yazılır → "en son ne zaman
   * güncellendi" bilgisi otomatik tutulur.
   */
  async upsert(
    plateId: string,
    dto: UpsertSupplierPriceDto,
  ): Promise<SupplierMaterialPrice> {
    await this.platesService.findOne(plateId);
    await this.suppliersService.findOne(dto.supplierId);

    const unit = dto.unit ?? PriceUnit.PER_PLATE;
    let price = await this.pricesRepo.findOne({
      where: { plateId, supplierId: dto.supplierId, unit },
    });

    if (price) {
      price.price = dto.price;
      price.currency = dto.currency ?? price.currency;
      price.note = dto.note ?? price.note;
      price.priceUpdatedAt = new Date();
    } else {
      price = this.pricesRepo.create({
        plateId,
        supplierId: dto.supplierId,
        price: dto.price,
        currency: dto.currency ?? 'TRY',
        unit,
        note: dto.note,
        priceUpdatedAt: new Date(),
      });
    }
    return this.pricesRepo.save(price);
  }

  list(plateId: string): Promise<SupplierMaterialPrice[]> {
    return this.pricesRepo.find({
      where: { plateId },
      order: { price: 'ASC' },
    });
  }

  /**
   * Fiyat karşılaştırması: en ucuz tedarikçi, en güncel fiyat ve tüm satırlar.
   * Yalnızca aynı birimdeki (unit) fiyatlar adil biçimde karşılaştırılır.
   */
  async compare(
    plateId: string,
    unit: PriceUnit = PriceUnit.PER_PLATE,
  ): Promise<PriceComparison> {
    await this.platesService.findOne(plateId);
    const rows = await this.pricesRepo.find({
      where: { plateId, unit },
      order: { price: 'ASC' },
    });

    const mapped: PriceComparisonRow[] = rows.map((r) => ({
      supplierId: r.supplierId,
      supplier: r.supplier?.name ?? 'Bilinmeyen',
      price: Number(r.price),
      currency: r.currency,
      unit: r.unit,
      updatedAt: r.priceUpdatedAt,
    }));

    const cheapest = mapped.length ? mapped[0] : null;
    const mostRecent = mapped.length
      ? [...mapped].sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
        )[0]
      : null;

    return { plateId, cheapest, mostRecent, prices: mapped };
  }

  async remove(plateId: string, priceId: string): Promise<void> {
    const price = await this.pricesRepo.findOne({
      where: { id: priceId, plateId },
    });
    if (price) {
      await this.pricesRepo.softRemove(price);
    }
  }
}

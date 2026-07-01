import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../common/dto/paginated-result';
import { totalAreaM2 } from '../../../common/utils/area.util';
import {
  MeasurementType,
  defaultUnitForMeasurement,
} from '../../../common/enums/measurement-type.enum';
import { WarehousesService } from '../../warehouses/warehouses.service';
import { MaterialPlate } from '../entities/material-plate.entity';
import { StockLevel } from '../entities/stock-level.entity';
import { CreatePlateDto } from '../dto/create-plate.dto';
import { UpdatePlateDto } from '../dto/update-plate.dto';
import { QueryPlateDto } from '../dto/query-plate.dto';
import { MaterialTemplatesService } from './material-templates.service';
import { MaterialBrandsService } from './material-brands.service';
import { MaterialColorsService } from './material-colors.service';
import { MaterialSizesService } from './material-sizes.service';
import { MaterialThicknessesService } from './material-thicknesses.service';
import { CustomersService } from '../../customers/services/customers.service';
import { TransferOwnershipDto } from '../dto/transfer-ownership.dto';

@Injectable()
export class PlatesService {
  private readonly defaultWarehouseCode: string;

  constructor(
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
    @InjectRepository(StockLevel)
    private readonly stockLevelsRepo: Repository<StockLevel>,
    private readonly templatesService: MaterialTemplatesService,
    private readonly warehousesService: WarehousesService,
    private readonly brandsService: MaterialBrandsService,
    private readonly colorsService: MaterialColorsService,
    private readonly sizesService: MaterialSizesService,
    private readonly thicknessesService: MaterialThicknessesService,
    private readonly customersService: CustomersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.defaultWarehouseCode =
      configService.get<string>('business.defaultWarehouseCode') ?? 'MERKEZ';
  }

  /**
   * Stok kalemi oluşturur. Verilmeyen alanlar şablondan miras alınır.
   * Ölçüm tipi AREA ise en/boy zorunludur; rulo/şerit (LENGTH) gibi tiplerde
   * boyutlar opsiyoneldir. Açılış stoğu verilirse ilgili depoya işletme stoğu
   * olarak (StockLevel) atomik biçimde yazılır.
   */
  async create(dto: CreatePlateDto): Promise<MaterialPlate> {
    const template = await this.templatesService.findOne(dto.templateId);
    const measurementType =
      dto.measurementType ?? template.measurementType ?? MeasurementType.AREA;
    const unitOfMeasure =
      dto.unitOfMeasure ?? defaultUnitForMeasurement(measurementType);

    const brandId = dto.brandId ?? template.defaultBrandId ?? null;
    const colorId = dto.colorId ?? template.defaultColorId ?? null;
    const sizeId = dto.sizeId ?? template.defaultSizeId ?? null;
    const thicknessId = dto.thicknessId ?? template.defaultThicknessId ?? null;

    const [brand, color, size, thickness] = await Promise.all([
      brandId === template.defaultBrandId
        ? Promise.resolve(template.defaultBrand ?? null)
        : this.resolveCatalogRef(this.brandsService, brandId, template.categoryId, 'marka'),
      colorId === template.defaultColorId
        ? Promise.resolve(template.defaultColor ?? null)
        : this.resolveCatalogRef(this.colorsService, colorId, template.categoryId, 'renk'),
      sizeId === template.defaultSizeId
        ? Promise.resolve(template.defaultSize ?? null)
        : this.resolveCatalogRef(this.sizesService, sizeId, template.categoryId, 'ebat'),
      thicknessId === template.defaultThicknessId
        ? Promise.resolve(template.defaultThickness ?? null)
        : this.resolveCatalogRef(
            this.thicknessesService,
            thicknessId,
            template.categoryId,
            'kalınlık',
          ),
    ]);

    // Standart tabaka ebadı (şablon/katalog). Kalan (kesilmiş) ebat bunu aşamaz.
    const standardWidthMm = size?.widthMm ?? null;
    const standardHeightMm = size?.heightMm ?? null;

    // Kalan (güncel) ebat: verilmezse standart tabaka ebadından miras alınır.
    const widthMm = dto.widthMm ?? standardWidthMm;
    const heightMm = dto.heightMm ?? standardHeightMm;
    const thicknessMm = thickness?.valueMm ?? null;

    this.assertRemainingWithinSheet(
      widthMm,
      heightMm,
      standardWidthMm,
      standardHeightMm,
    );

    if (measurementType === MeasurementType.AREA) {
      if (widthMm == null || heightMm == null) {
        throw new BadRequestException(
          'Tabaka (AREA) malzemede en ve boy, kalemde veya şablon varsayılanlarında tanımlı olmalıdır.',
        );
      }
    }

    // Konsinye sahibi verildiyse müşterinin varlığını doğrula (yoksa NotFound).
    const ownerCustomerId = dto.ownerCustomerId ?? null;
    if (ownerCustomerId) {
      await this.customersService.findOne(ownerCustomerId);
    }

    // Stok kodu elle verilmediyse tür+marka+renk+kalınlık+tabaka ebatından üret.
    const sku =
      dto.sku ?? (await this.buildSku(template, brand, color, thickness, size));
    const addedAt = dto.addedAt ?? new Date().toISOString().slice(0, 10);

    const initialQty = dto.quantityInStock ?? 0;

    return this.dataSource.transaction(async (manager) => {
      const plate = manager.create(MaterialPlate, {
        templateId: template.id,
        measurementType,
        unitOfMeasure,
        name: dto.name ?? this.buildCatalogName(brand, color, size, thickness),
        sku,
        brand: brand?.name,
        brandId: brand?.id ?? null,
        color: color?.name,
        colorCode: color?.code,
        colorId: color?.id ?? null,
        variant: dto.variant ?? template.defaultVariant,
        widthMm,
        heightMm,
        sizeId: size?.id ?? null,
        thicknessMm,
        thicknessId: thickness?.id ?? null,
        attributes: { ...template.defaultAttributes, ...(dto.attributes ?? {}) },
        quantityInStock: 0,
        reorderLevel: dto.reorderLevel,
        addedAt,
        processedAt: dto.processedAt ?? null,
      });
      const saved = await manager.save(plate);

      if (initialQty > 0) {
        const warehouse = dto.warehouseId
          ? await this.warehousesService.findOne(dto.warehouseId)
          : await this.warehousesService.resolveDefault(
              this.defaultWarehouseCode,
              manager,
            );
        await this.adjustStock(
          saved.id,
          warehouse.id,
          initialQty,
          ownerCustomerId,
          manager,
        );
      }
      return manager.findOneOrFail(MaterialPlate, { where: { id: saved.id } });
    });
  }

  /**
   * Gelişmiş filtreleme: kategori, ölçüm tipi, marka, renk, depo, konsinye sahibi
   * ve stok durumu + serbest arama. Liste sayfalanır.
   */
  async findAll(query: QueryPlateDto): Promise<PaginatedResult<MaterialPlate>> {
    const qb = this.platesRepo
      .createQueryBuilder('plate')
      .leftJoinAndSelect('plate.template', 'template')
      // Kategori adı listede/gruplamada ve teklif seçicisinde görünsün
      // (QueryBuilder eager ilişkileri otomatik yüklemez).
      .leftJoinAndSelect('template.category', 'category')
      .leftJoinAndSelect('template.defaultSize', 'defaultSize');

    // Depo/sahip filtresi için stok seviyelerine join.
    if (query.warehouseId || query.ownerCustomerId || query.owner) {
      qb.innerJoin(
        StockLevel,
        'sl',
        'sl.plate_id = plate.id AND sl.deleted_at IS NULL',
      );
      if (query.warehouseId) {
        qb.andWhere('sl.warehouse_id = :warehouseId', {
          warehouseId: query.warehouseId,
        });
      }
      if (query.ownerCustomerId) {
        qb.andWhere('sl.owner_customer_id = :ownerCustomerId', {
          ownerCustomerId: query.ownerCustomerId,
        });
      }
      if (query.owner === 'business') {
        qb.andWhere('sl.owner_customer_id IS NULL');
      } else if (query.owner === 'customer') {
        qb.andWhere('sl.owner_customer_id IS NOT NULL');
      }
      qb.andWhere('sl.quantity > 0').distinct(true);
    }

    if (query.from) {
      qb.andWhere('plate.added_at >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('plate.added_at <= :to', { to: query.to });
    }

    if (query.templateId) {
      qb.andWhere('plate.template_id = :templateId', {
        templateId: query.templateId,
      });
    }
    if (query.categoryId) {
      qb.andWhere('template.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.measurementType) {
      qb.andWhere('plate.measurement_type = :mt', { mt: query.measurementType });
    }
    if (query.brand) {
      qb.andWhere('plate.brand ILIKE :brand', { brand: `%${query.brand}%` });
    }
    if (query.color) {
      qb.andWhere('plate.color ILIKE :color', { color: `%${query.color}%` });
    }
    if (query.inStock) {
      qb.andWhere('plate.quantity_in_stock > 0');
    }
    // Alıcının kendi (stoktaki) malzemelerini hariç tut — kişiye kendi malını
    // satış kalemi olarak eklemeyi engeller.
    if (query.excludeOwnerCustomerId) {
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM stock_levels sx
                      WHERE sx.plate_id = plate.id
                        AND sx.owner_customer_id = :exclOwner
                        AND sx.quantity > 0
                        AND sx.deleted_at IS NULL)`,
        { exclOwner: query.excludeOwnerCustomerId },
      );
    }
    if (query.search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('plate.name ILIKE :s', { s: `%${query.search}%` })
            .orWhere('plate.sku ILIKE :s', { s: `%${query.search}%` })
            .orWhere('plate.color_code ILIKE :s', { s: `%${query.search}%` });
        }),
      );
    }

    qb.orderBy('plate.name', 'ASC').skip(query.skip).take(query.limit);

    const [items, total] = await qb.getManyAndCount();
    await this.attachOwners(items);
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  /**
   * Her plakaya güncel sahip(ler)ini ekler (dinamik): işletme stoğu varsa
   * "İşletme", konsinye seviyeleri varsa o müşterilerin adları. Liste/başlıkta
   * "kimin nesi" görünmesi için kullanılır.
   */
  private async attachOwners(plates: MaterialPlate[]): Promise<void> {
    if (!plates.length) return;
    const ids = plates.map((p) => p.id);
    const rows: { plate_id: string; name: string }[] = await this.dataSource.query(
      `SELECT DISTINCT sl.plate_id, c.name
         FROM stock_levels sl
         JOIN customers c ON c.id = sl.owner_customer_id
        WHERE sl.plate_id = ANY($1)
          AND sl.owner_customer_id IS NOT NULL
          AND sl.quantity > 0
          AND sl.deleted_at IS NULL`,
      [ids],
    );
    const consignByPlate = new Map<string, string[]>();
    for (const r of rows) {
      const list = consignByPlate.get(r.plate_id) ?? [];
      list.push(r.name);
      consignByPlate.set(r.plate_id, list);
    }
    for (const plate of plates) {
      const owners: string[] = [];
      if (Number(plate.quantityInStock) > 0) owners.push('İşletme');
      owners.push(...(consignByPlate.get(plate.id) ?? []));
      (plate as MaterialPlate & { owners?: string[] }).owners = owners;
    }
  }

  async findOne(id: string): Promise<MaterialPlate> {
    const plate = await this.platesRepo.findOne({
      where: { id },
      relations: { supplierPrices: true },
    });
    if (!plate) {
      throw new NotFoundException('Stok kalemi bulunamadı.');
    }
    return plate;
  }

  /** Bir kalemin depo/sahip bazlı stok seviyeleri (konsinye dahil). */
  listStockLevels(plateId: string): Promise<StockLevel[]> {
    return this.stockLevelsRepo.find({ where: { plateId } });
  }

  async update(id: string, dto: UpdatePlateDto): Promise<MaterialPlate> {
    const plate = await this.findOne(id);
    const { attributes, ...rest } = dto;
    Object.assign(plate, rest);
    if (attributes) {
      plate.attributes = { ...plate.attributes, ...attributes };
    }
    // Güncellenen kalan ebat, türün standart tabaka ebadını aşamaz.
    const std = plate.template?.defaultSize;
    this.assertRemainingWithinSheet(
      plate.widthMm ?? null,
      plate.heightMm ?? null,
      std?.widthMm ?? null,
      std?.heightMm ?? null,
    );
    const saved = await this.platesRepo.save(plate);

    // Tabaka (AREA) malzemede kalan m² tükendiyse plakayı stoktan düş.
    if (
      saved.measurementType === MeasurementType.AREA &&
      (Number(saved.widthMm) <= 0 || Number(saved.heightMm) <= 0)
    ) {
      await this.deplete(saved.id);
      saved.isActive = false;
    }
    return saved;
  }

  async remove(id: string): Promise<void> {
    const plate = await this.findOne(id);
    await this.platesRepo.softRemove(plate);
  }

  /** Tek adetin alanı (m²) — yalnızca AREA tipinde anlamlıdır. */
  unitAreaM2(plate: MaterialPlate): number {
    if (plate.measurementType !== MeasurementType.AREA) {
      throw new BadRequestException(
        'Alan (m²) yalnızca tabaka (AREA) tipi malzemede hesaplanır.',
      );
    }
    return totalAreaM2(Number(plate.widthMm), Number(plate.heightMm), 1);
  }

  /**
   * Depo (ve opsiyonel konsinye sahibi) bazında stok miktarını delta kadar
   * değiştirir (alış → +, işleme/satış → −). ownerCustomerId null ise işletme
   * stoğudur ve plate.quantityInStock toplam cache'i de güncellenir.
   * Transaction ile atomik kalması için opsiyonel EntityManager alır.
   */
  async adjustStock(
    plateId: string,
    warehouseId: string,
    delta: number,
    ownerCustomerId: string | null = null,
    manager?: EntityManager,
    allowNegative = false,
  ): Promise<StockLevel> {
    const slRepo = manager
      ? manager.getRepository(StockLevel)
      : this.stockLevelsRepo;
    const plateRepo = manager
      ? manager.getRepository(MaterialPlate)
      : this.platesRepo;

    let level = await slRepo.findOne({
      where: {
        plateId,
        warehouseId,
        ownerCustomerId: ownerCustomerId ?? IsNull(),
      },
    });
    if (!level) {
      level = slRepo.create({
        plateId,
        warehouseId,
        ownerCustomerId: ownerCustomerId ?? null,
        quantity: 0,
      });
    }

    const next = Number(level.quantity) + delta;
    if (next < 0 && !allowNegative) {
      throw new BadRequestException(
        `Yetersiz stok. Mevcut: ${level.quantity}, talep edilen düşüş: ${-delta}.`,
      );
    }
    // allowNegative: teklif→satış dönüşümü gibi taahhüt edilmiş satışlarda stok
    // negatife (backorder) düşebilir; böylece tek transaction'daki işleme
    // kalemleri de geri alınmaz, dönüşüm tamamlanır.
    level.quantity = next;
    const savedLevel = await slRepo.save(level);

    // İşletme stoğu (sahipsiz) ise toplam cache'i de güncelle.
    if (ownerCustomerId == null) {
      const plate = await plateRepo.findOne({ where: { id: plateId } });
      if (plate) {
        const prevTotal = Number(plate.quantityInStock);
        const newTotal = prevTotal + delta;
        plate.quantityInStock = newTotal;
        await plateRepo.save(plate);

        // Kritik stok eşiği aşağı geçildiyse uyarı olayı yay.
        if (
          delta < 0 &&
          plate.reorderLevel != null &&
          prevTotal > Number(plate.reorderLevel) &&
          newTotal <= Number(plate.reorderLevel)
        ) {
          this.eventEmitter.emit('stock.low', {
            plateId: plate.id,
            plateName: plate.name,
            warehouseId,
            quantity: newTotal,
            reorderLevel: Number(plate.reorderLevel),
          });
        }
      }
    }
    return savedLevel;
  }

  /**
   * Satış/işleme tüketimi. TABAKA (AREA) malzemede stok adet değil EBAT olarak
   * düşülür: kesilen parçanın boyu (heightMm) kadar kalan BOY azalır, EN (tabaka
   * genişliği) sabit kalır — tam genişlikte şerit kesimi varsayımı. Böylece
   * 135×200 tabakadan 135×100 ya da 100×100 satıldığında kalan 135×100 olur.
   * Kalan boy ≤ 0 olursa tabaka stoktan çıkar. AREA dışı malzemede klasik adet
   * düşüşü uygulanır. Dönüş: AREA'da düşülen toplam boy (mm) — iptalde geri
   * eklemek için; adet düşüşünde 0.
   */
  async consume(opts: {
    plateId: string;
    warehouseId: string;
    quantity: number;
    consumedHeightMm?: number | null;
    /** Düşülecek m² (boy verilmediyse: kesim boyu = m²×1e6 / kalan en). */
    areaM2?: number | null;
    ownerCustomerId?: string | null;
    manager: EntityManager;
    allowNegative?: boolean;
  }): Promise<number> {
    const {
      plateId,
      warehouseId,
      quantity,
      ownerCustomerId = null,
      manager,
      allowNegative = false,
    } = opts;

    const plate = await manager.findOne(MaterialPlate, {
      where: { id: plateId },
      // Tükenip soft-delete olmuş tabaka da AREA yolundan (ebat) düşülmeli;
      // aksi halde null gelip adet yoluna düşüyor ve "Yetersiz stok" hatası
      // veriyordu (örn. aynı plaka teklifte hem satılıp hem işlendiğinde).
      withDeleted: true,
    });

    // TABAKA (AREA): stok DAİMA ebattan (m²) düşülür — adet yoluna hiç düşmez,
    // böylece "Yetersiz stok (adet)" hatası AREA malzemede oluşamaz. Kesim boyu:
    //  1) verilen kesim boyu × adet, yoksa
    //  2) m² × 1e6 / kalan en, yoksa
    //  3) kalan boyun tamamı (parça tüm tabakayı tüketir).
    if (plate && plate.measurementType === MeasurementType.AREA) {
      const width = Number(plate.widthMm) || 0;
      let cutHeight = 0;
      if (opts.consumedHeightMm != null && Number(opts.consumedHeightMm) > 0) {
        cutHeight = Number(opts.consumedHeightMm) * (quantity || 1);
      } else if (opts.areaM2 != null && Number(opts.areaM2) > 0 && width > 0) {
        cutHeight = (Number(opts.areaM2) * 1_000_000) / width;
      } else {
        cutHeight = Number(plate.heightMm) || 0;
      }
      if (cutHeight <= 0) return 0; // düşülecek bir şey yok (hata verme)
      return this.reduceSheetHeight(plate, cutHeight, manager, allowNegative);
    }

    // AREA dışı: klasik adet düşüşü.
    await this.adjustStock(
      plateId,
      warehouseId,
      -quantity,
      ownerCustomerId,
      manager,
      allowNegative,
    );
    return 0;
  }

  /** Tabakanın kalan boyunu kesim kadar azaltır; biterse tüketir (soft-remove). */
  private async reduceSheetHeight(
    plate: MaterialPlate,
    cutHeightMm: number,
    manager: EntityManager,
    allowNegative: boolean,
  ): Promise<number> {
    const current = Number(plate.heightMm) || 0;
    const next = current - cutHeightMm;
    if (next <= 0) {
      if (next < 0 && !allowNegative) {
        throw new BadRequestException(
          `Yetersiz tabaka boyu. Kalan: ${current} mm, kesilen: ${cutHeightMm} mm.`,
        );
      }
      // Tabaka tümüyle tükendi: stok seviyelerini sıfırla + listeden kaldır.
      await manager.getRepository(StockLevel).delete({ plateId: plate.id });
      plate.quantityInStock = 0;
      plate.heightMm = 0;
      plate.isActive = false;
      await manager.save(MaterialPlate, plate);
      await manager.softRemove(MaterialPlate, plate);
      return current;
    }
    plate.heightMm = next;
    await manager.save(MaterialPlate, plate);
    return cutHeightMm;
  }

  /**
   * İptal/iade: tabakanın kalan boyunu geri ekler (best-effort). Tabaka silinmişse
   * geri yükler. AREA dışı iadeler için adjustStock kullanılır.
   */
  async restoreSheetHeight(
    plateId: string,
    heightMm: number,
    manager: EntityManager,
  ): Promise<void> {
    if (!heightMm) return;
    const plate = await manager.findOne(MaterialPlate, {
      where: { id: plateId },
      withDeleted: true,
    });
    if (!plate) return;
    plate.heightMm = (Number(plate.heightMm) || 0) + heightMm;
    if (plate.deletedAt) {
      plate.deletedAt = null;
      plate.isActive = true;
      plate.quantityInStock = Number(plate.quantityInStock) || 1;
    }
    await manager.save(MaterialPlate, plate);
  }

  /** Marka[Renk Kod] Kalınlıkxenxboy kalıbında otomatik ad üretir; eksik kısımlar "—" ile gösterilir. */
  private buildCatalogName(
    brand: { name: string } | null,
    color: { name: string; code?: string | null } | null,
    size: { widthMm: number; heightMm: number } | null,
    thickness: { valueMm: number } | null,
  ): string {
    const brandPart = brand?.name ?? '—';
    const colorPart = color
      ? color.code
        ? `${color.name} ${color.code}`
        : color.name
      : '—';
    const thicknessPart = thickness?.valueMm ?? '—';
    const sizePart = size ? `${size.widthMm}x${size.heightMm}` : '—x—';
    return `${brandPart}[${colorPart}] ${thicknessPart}x${sizePart}`;
  }

  /** Kalan (kesilmiş) ebat, standart tabaka ebadını aşarsa hata fırlatır. */
  private assertRemainingWithinSheet(
    widthMm: number | null,
    heightMm: number | null,
    sheetWidthMm: number | null,
    sheetHeightMm: number | null,
  ): void {
    if (
      (sheetWidthMm != null && widthMm != null && widthMm > sheetWidthMm) ||
      (sheetHeightMm != null && heightMm != null && heightMm > sheetHeightMm)
    ) {
      throw new BadRequestException(
        `Kalan ebat (${widthMm}x${heightMm}) tabaka ebadını (${sheetWidthMm}x${sheetHeightMm}) aşamaz.`,
      );
    }
  }

  /**
   * Stok kodunu tür + marka + renk(+kod) + kalınlık + tabaka ebatından üretir.
   * SKU benzersiz (kısmi unique index) olduğundan, taban kod doluysa "-N" ekiyle
   * benzersizleştirilir (silinmiş kayıtlar da dikkate alınır).
   */
  private async buildSku(
    template: { name: string },
    brand: { name: string } | null,
    color: { name: string; code?: string | null } | null,
    thickness: { valueMm: number } | null,
    size: { widthMm: number; heightMm: number } | null,
  ): Promise<string> {
    const colorPart = color
      ? color.code
        ? `${color.name} ${color.code}`
        : color.name
      : null;
    const parts = [
      template.name,
      brand?.name ?? null,
      colorPart,
      thickness?.valueMm != null ? `${thickness.valueMm}mm` : null,
      size ? `${size.widthMm}x${size.heightMm}` : null,
    ].filter((p): p is string => !!p);
    const base = this.slugify(parts.join('-')) || 'SKU';

    let candidate = base;
    let n = 1;
    while (
      await this.platesRepo.findOne({
        where: { sku: candidate },
        withDeleted: true,
      })
    ) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    return candidate;
  }

  /** Türkçe karakterleri ASCII'ye indirger, büyük harfe çevirip tireli koda dönüştürür. */
  private slugify(value: string): string {
    const map: Record<string, string> = {
      ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
      Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u',
    };
    return value
      .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c] ?? c)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Stok sahipliğini taraflar arasında serbestçe aktarır (işletme↔müşteri ve
   * müşteri↔müşteri). Kaynak/hedef `null` ise o taraf işletmedir. Kaynaktaki
   * miktar düşülür, aynı miktar hedefe eklenir. Miktar verilmezse tümü aktarılır.
   */
  async transferOwnership(
    plateId: string,
    dto: TransferOwnershipDto,
  ): Promise<StockLevel> {
    await this.findOne(plateId);
    const fromOwner = dto.fromOwnerCustomerId ?? null;
    const toOwner = dto.toOwnerCustomerId ?? null;
    if (fromOwner === toOwner) {
      throw new BadRequestException(
        'Kaynak ve hedef sahip aynı olamaz.',
      );
    }
    if (fromOwner) await this.customersService.findOne(fromOwner);
    if (toOwner) await this.customersService.findOne(toOwner);

    return this.dataSource.transaction(async (manager) => {
      const warehouse = dto.warehouseId
        ? await this.warehousesService.findOne(dto.warehouseId)
        : await this.warehousesService.resolveDefault(
            this.defaultWarehouseCode,
            manager,
          );

      const source = await manager.getRepository(StockLevel).findOne({
        where: {
          plateId,
          warehouseId: warehouse.id,
          ownerCustomerId: fromOwner ?? IsNull(),
        },
      });
      const available = source ? Number(source.quantity) : 0;
      if (available <= 0) {
        throw new BadRequestException(
          'Bu depoda aktarılacak stok bulunmuyor.',
        );
      }
      const qty = dto.quantity ?? available;
      if (qty <= 0 || qty > available) {
        throw new BadRequestException(
          `Aktarılacak miktar 0 ile ${available} arasında olmalıdır.`,
        );
      }

      // Kaynaktan düş, hedefe ekle (adjustStock işletme tarafında cache'i günceller).
      await this.adjustStock(plateId, warehouse.id, -qty, fromOwner, manager);
      return this.adjustStock(plateId, warehouse.id, qty, toOwner, manager);
    });
  }

  /**
   * "Tamamını sat" / stoktan tamamen çıkar: tüm depo/sahip seviyelerini sıfırlar
   * ve plakayı (soft-delete) listeden kaldırır. Kalan m² tükendiğinde de çağrılır.
   */
  async deplete(plateId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const plate = await manager.findOne(MaterialPlate, {
        where: { id: plateId },
      });
      if (!plate) {
        throw new NotFoundException('Stok kalemi bulunamadı.');
      }
      // Tüm stok seviyelerini sıfırla (konsinye dahil) ve toplam cache'i temizle.
      await manager.getRepository(StockLevel).delete({ plateId });
      plate.quantityInStock = 0;
      plate.isActive = false;
      await manager.save(plate);
      await manager.softRemove(plate);
    });
  }

  /**
   * Verilen id'deki katalog kaydını çeker ve şablonun kategorisiyle eşleştiğini
   * doğrular. id `null` ise (ne dto'da ne şablonda tanımlı) `null` döner.
   */
  private async resolveCatalogRef<T extends { categoryId: string }>(
    service: { findOne(id: string): Promise<T> },
    id: string | null,
    templateCategoryId: string,
    label: string,
  ): Promise<T | null> {
    if (!id) return null;
    const record = await service.findOne(id);
    if (record.categoryId !== templateCategoryId) {
      throw new BadRequestException(
        `Seçilen ${label} bu şablonun kategorisine ait değil.`,
      );
    }
    return record;
  }
}

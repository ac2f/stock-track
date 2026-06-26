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
import { MaterialTemplate } from '../entities/material-template.entity';
import { StockLevel } from '../entities/stock-level.entity';
import { CreatePlateDto } from '../dto/create-plate.dto';
import { UpdatePlateDto } from '../dto/update-plate.dto';
import { QueryPlateDto } from '../dto/query-plate.dto';
import { MaterialTemplatesService } from './material-templates.service';

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

    const widthMm = dto.widthMm ?? template.defaultWidthMm ?? null;
    const heightMm = dto.heightMm ?? template.defaultHeightMm ?? null;
    const thicknessMm = dto.thicknessMm ?? template.defaultThicknessMm ?? null;

    if (measurementType === MeasurementType.AREA) {
      if (widthMm == null || heightMm == null) {
        throw new BadRequestException(
          'Tabaka (AREA) malzemede en ve boy, kalemde veya şablon varsayılanlarında tanımlı olmalıdır.',
        );
      }
    }

    const initialQty = dto.quantityInStock ?? 0;

    return this.dataSource.transaction(async (manager) => {
      const plate = manager.create(MaterialPlate, {
        templateId: template.id,
        measurementType,
        unitOfMeasure,
        name: dto.name ?? this.deriveName(template, dto),
        sku: dto.sku,
        brand: dto.brand ?? template.defaultBrand,
        color: dto.color ?? template.defaultColor,
        colorCode: dto.colorCode ?? template.defaultColorCode,
        widthMm,
        heightMm,
        thicknessMm,
        attributes: { ...template.defaultAttributes, ...(dto.attributes ?? {}) },
        quantityInStock: 0,
        reorderLevel: dto.reorderLevel,
      });
      const saved = await manager.save(plate);

      if (initialQty > 0) {
        const warehouse = dto.warehouseId
          ? await this.warehousesService.findOne(dto.warehouseId)
          : await this.warehousesService.resolveDefault(
              this.defaultWarehouseCode,
              manager,
            );
        await this.adjustStock(saved.id, warehouse.id, initialQty, null, manager);
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
      .leftJoinAndSelect('plate.template', 'template');

    // Depo/sahip filtresi için stok seviyelerine join.
    if (query.warehouseId || query.ownerCustomerId) {
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
      qb.andWhere('sl.quantity > 0').distinct(true);
    }

    if (query.templateId) {
      qb.andWhere('plate.template_id = :templateId', {
        templateId: query.templateId,
      });
    }
    if (query.category) {
      qb.andWhere('template.category = :category', { category: query.category });
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
    return buildPaginatedResult(items, total, query.page, query.limit);
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
    return this.platesRepo.save(plate);
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
    if (next < 0) {
      throw new BadRequestException(
        `Yetersiz stok. Mevcut: ${level.quantity}, talep edilen düşüş: ${-delta}.`,
      );
    }
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

  private deriveName(template: MaterialTemplate, dto: CreatePlateDto): string {
    const dims =
      dto.widthMm && dto.heightMm ? `${dto.widthMm}x${dto.heightMm}` : null;
    const parts = [
      template.name,
      dto.color ?? template.defaultColor,
      dims,
    ].filter(Boolean);
    return parts.join(' · ');
  }
}

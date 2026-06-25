import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../common/dto/paginated-result';
import { totalAreaM2 } from '../../../common/utils/area.util';
import { MaterialPlate } from '../entities/material-plate.entity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { CreatePlateDto } from '../dto/create-plate.dto';
import { UpdatePlateDto } from '../dto/update-plate.dto';
import { QueryPlateDto } from '../dto/query-plate.dto';
import { MaterialTemplatesService } from './material-templates.service';

@Injectable()
export class PlatesService {
  constructor(
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
    private readonly templatesService: MaterialTemplatesService,
  ) {}

  /**
   * Plaka oluşturur. Verilmeyen alanlar şablondan miras alınır → aynı
   * özellikleri tekrar tekrar yazma ihtiyacı ortadan kalkar.
   */
  async create(dto: CreatePlateDto): Promise<MaterialPlate> {
    const template = await this.templatesService.findOne(dto.templateId);

    const widthMm = dto.widthMm ?? template.defaultWidthMm;
    const heightMm = dto.heightMm ?? template.defaultHeightMm;
    const thicknessMm = dto.thicknessMm ?? template.defaultThicknessMm;

    if (widthMm == null || heightMm == null || thicknessMm == null) {
      throw new BadRequestException(
        'En, boy ve kalınlık plakada veya şablonun varsayılanlarında tanımlı olmalıdır.',
      );
    }

    const plate = this.platesRepo.create({
      templateId: template.id,
      name: dto.name ?? this.deriveName(template, dto),
      sku: dto.sku,
      brand: dto.brand ?? template.defaultBrand,
      color: dto.color ?? template.defaultColor,
      colorCode: dto.colorCode ?? template.defaultColorCode,
      widthMm,
      heightMm,
      thicknessMm,
      attributes: { ...template.defaultAttributes, ...(dto.attributes ?? {}) },
      quantityInStock: dto.quantityInStock ?? 0,
      reorderLevel: dto.reorderLevel,
    });
    return this.platesRepo.save(plate);
  }

  /**
   * Gelişmiş filtreleme: kategori, marka, renk, stok durumu + serbest arama.
   * Liste sayfalanır.
   */
  async findAll(query: QueryPlateDto): Promise<PaginatedResult<MaterialPlate>> {
    const qb = this.platesRepo
      .createQueryBuilder('plate')
      .leftJoinAndSelect('plate.template', 'template');

    if (query.templateId) {
      qb.andWhere('plate.template_id = :templateId', {
        templateId: query.templateId,
      });
    }
    if (query.category) {
      qb.andWhere('template.category = :category', {
        category: query.category,
      });
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
      throw new NotFoundException('Plaka bulunamadı.');
    }
    return plate;
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

  /** Bir plakanın tek bir adedinin alanı (m²). */
  unitAreaM2(plate: MaterialPlate): number {
    return totalAreaM2(plate.widthMm, plate.heightMm, 1);
  }

  /**
   * Stok miktarını delta kadar değiştirir (alış → +, işleme → −).
   * Transaction içinde çağrılabilmesi için opsiyonel EntityManager alır;
   * böylece satın alma/işleme akışlarıyla atomik kalır.
   */
  async adjustStock(
    plateId: string,
    delta: number,
    manager?: EntityManager,
  ): Promise<MaterialPlate> {
    const repo = manager
      ? manager.getRepository(MaterialPlate)
      : this.platesRepo;
    const plate = await repo.findOne({ where: { id: plateId } });
    if (!plate) {
      throw new NotFoundException('Plaka bulunamadı.');
    }
    const next = Number(plate.quantityInStock) + delta;
    if (next < 0) {
      throw new BadRequestException(
        `Yetersiz stok. Mevcut: ${plate.quantityInStock}, talep edilen düşüş: ${-delta}.`,
      );
    }
    plate.quantityInStock = next;
    return repo.save(plate);
  }

  private deriveName(
    template: MaterialTemplate,
    dto: CreatePlateDto,
  ): string {
    const parts = [
      template.name,
      dto.color ?? template.defaultColor,
      dto.widthMm && dto.heightMm ? `${dto.widthMm}x${dto.heightMm}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }
}

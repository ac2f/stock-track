import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { MaterialTemplate } from '../entities/material-template.entity';
import { CreateMaterialTemplateDto } from '../dto/create-material-template.dto';
import { UpdateMaterialTemplateDto } from '../dto/update-material-template.dto';
import { MaterialCategoriesService } from './material-categories.service';
import { MaterialBrandsService } from './material-brands.service';
import { MaterialColorsService } from './material-colors.service';
import { MaterialSizesService } from './material-sizes.service';
import { MaterialThicknessesService } from './material-thicknesses.service';

@Injectable()
export class MaterialTemplatesService {
  constructor(
    @InjectRepository(MaterialTemplate)
    private readonly templatesRepo: Repository<MaterialTemplate>,
    private readonly categoriesService: MaterialCategoriesService,
    private readonly brandsService: MaterialBrandsService,
    private readonly colorsService: MaterialColorsService,
    private readonly sizesService: MaterialSizesService,
    private readonly thicknessesService: MaterialThicknessesService,
  ) {}

  /**
   * Seçilen marka/renk/ebat/kalınlık kataloğu kayıtlarının `categoryId`'sinin
   * şablonun kategorisiyle eşleştiğini doğrular (örn. Pleksi şablonunda
   * Kompozit markası seçilemez).
   */
  private async validateCatalogRefs(
    categoryId: string,
    dto: Pick<
      CreateMaterialTemplateDto,
      'defaultBrandId' | 'defaultColorId' | 'defaultSizeId' | 'defaultThicknessId'
    >,
  ): Promise<void> {
    const checks: Array<[string | undefined, () => Promise<{ categoryId: string }>, string]> = [
      [dto.defaultBrandId, () => this.brandsService.findOne(dto.defaultBrandId as string), 'marka'],
      [dto.defaultColorId, () => this.colorsService.findOne(dto.defaultColorId as string), 'renk'],
      [dto.defaultSizeId, () => this.sizesService.findOne(dto.defaultSizeId as string), 'ebat'],
      [
        dto.defaultThicknessId,
        () => this.thicknessesService.findOne(dto.defaultThicknessId as string),
        'kalınlık',
      ],
    ];
    for (const [id, fetch, label] of checks) {
      if (!id) continue;
      const record = await fetch();
      if (record.categoryId !== categoryId) {
        throw new BadRequestException(
          `Seçilen ${label} bu şablonun kategorisine ait değil.`,
        );
      }
    }
  }

  async create(dto: CreateMaterialTemplateDto): Promise<MaterialTemplate> {
    await this.categoriesService.findOne(dto.categoryId);
    await this.validateCatalogRefs(dto.categoryId, dto);
    return this.templatesRepo.save(
      this.templatesRepo.create({
        ...dto,
        defaultAttributes: dto.defaultAttributes ?? {},
      }),
    );
  }

  findAll(filters: {
    categoryId?: string;
    search?: string;
  }): Promise<MaterialTemplate[]> {
    const where: FindOptionsWhere<MaterialTemplate> = {};
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }
    if (filters.search) {
      where.name = ILike(`%${filters.search}%`);
    }
    return this.templatesRepo.find({ where, order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<MaterialTemplate> {
    const template = await this.templatesRepo.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('Malzeme şablonu bulunamadı.');
    }
    return template;
  }

  async update(
    id: string,
    dto: UpdateMaterialTemplateDto,
  ): Promise<MaterialTemplate> {
    const template = await this.findOne(id);
    const categoryId = dto.categoryId ?? template.categoryId;
    if (dto.categoryId) {
      await this.categoriesService.findOne(dto.categoryId);
    }
    await this.validateCatalogRefs(categoryId, dto);
    Object.assign(template, dto);
    return this.templatesRepo.save(template);
  }

  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);
    await this.templatesRepo.softRemove(template);
  }
}

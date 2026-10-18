import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { CreateMaterialTemplateDto } from '../dto/create-material-template.dto';
import { UpdateMaterialTemplateDto } from '../dto/update-material-template.dto';
import { MaterialCategoriesService } from './material-categories.service';
import { MaterialBrandsService } from './material-brands.service';
import { MaterialColorsService } from './material-colors.service';
import { MaterialSizesService } from './material-sizes.service';
import { MaterialThicknessesService } from './material-thicknesses.service';
import { CatalogDedupeService } from './catalog-dedupe.service';
import { templateKey, TemplateKeyFields } from '../catalog-key.util';

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
    private readonly dedupe: CatalogDedupeService,
  ) {}

  /**
   * Aynı ürün türü ikinci kez açılmaz: aynı kategori + marka + renk + ebat +
   * kalınlık + alt tür (özelliksiz türde aynı ad) zaten varsa reddedilir.
   */
  private async assertUnique(fields: TemplateKeyFields, exceptId?: string): Promise<void> {
    const key = templateKey(fields);
    const rows = await this.templatesRepo.find({ where: { categoryId: fields.categoryId } });
    const dup = rows.find((t) => t.id !== exceptId && templateKey(t) === key);
    if (dup) {
      throw new ConflictException(
        `Bu özelliklerde bir ürün türü zaten var: "${dup.name}". Onu kullanın; ` +
          'farklı bir ürünse Tür/Varyant alanına ayırt edici bir bilgi yazın (ör. Dökme / Çekme).',
      );
    }
  }

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
    await this.assertUnique(dto);
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
    await this.assertUnique(
      {
        categoryId,
        name: dto.name ?? template.name,
        defaultBrandId: dto.defaultBrandId !== undefined ? dto.defaultBrandId : template.defaultBrandId,
        defaultColorId: dto.defaultColorId !== undefined ? dto.defaultColorId : template.defaultColorId,
        defaultSizeId: dto.defaultSizeId !== undefined ? dto.defaultSizeId : template.defaultSizeId,
        defaultThicknessId:
          dto.defaultThicknessId !== undefined ? dto.defaultThicknessId : template.defaultThicknessId,
        defaultVariant: dto.defaultVariant !== undefined ? dto.defaultVariant : template.defaultVariant,
      },
      id,
    );
    // Object.assign + save, eager yüklü ilişki nesneleri (defaultSize vb.) FK
    // kolonundaki değişikliği eziyordu (TypeORM ilişki nesnesini önceler) →
    // kolonları doğrudan güncelle, sonra taze halini dön.
    if (Object.keys(dto).length > 0) {
      await this.templatesRepo.update(
        id,
        // JSON kolonu (defaultAttributes) TypeORM update tipiyle uyumsuz görünür
        // (bilinen tip kısıtı) — çalışma zamanında sorunsuz.
        { ...dto } as QueryDeepPartialEntity<MaterialTemplate>,
      );
    }
    return this.findOne(id);
  }

  /**
   * Kopya ürün türlerini bu türe birleştirir: stok kalemleri bu türe taşınır,
   * kopyalar silinir. Hepsi aynı kategoride olmalı.
   */
  async merge(id: string, sourceIds: string[]): Promise<{ merged: number; template: MaterialTemplate }> {
    const target = await this.findOne(id);
    const sources = [];
    for (const sid of new Set(sourceIds)) {
      if (sid === id) continue;
      const src = await this.findOne(sid);
      if (src.categoryId !== target.categoryId) {
        throw new BadRequestException('Yalnız aynı malzeme türündeki ürün türleri birleştirilebilir.');
      }
      sources.push(src.id);
    }
    const merged = await this.dedupe.mergeTemplates(id, sources);
    return { merged, template: await this.findOne(id) };
  }

  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);
    await this.templatesRepo.softRemove(template);
  }
}

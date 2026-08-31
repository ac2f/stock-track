import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { cleanName, normalizeName } from '../catalog-key.util';
import { MaterialCategoryEntity } from '../entities/material-category.entity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { CreateMaterialCategoryDto } from '../dto/create-material-category.dto';
import { UpdateMaterialCategoryDto } from '../dto/update-material-category.dto';

@Injectable()
export class MaterialCategoriesService {
  constructor(
    @InjectRepository(MaterialCategoryEntity)
    private readonly categoriesRepo: Repository<MaterialCategoryEntity>,
    @InjectRepository(MaterialTemplate)
    private readonly templatesRepo: Repository<MaterialTemplate>,
  ) {}

  /**
   * Malzeme türü ekler. Aynı ad (büyük/küçük harf ve fazladan boşluk farkları
   * yok sayılarak) zaten varsa YENİSİ AÇILMAZ, mevcut tür döner — böylece
   * "Dekota / dekota / DEKOTA" gibi kopyalar oluşmaz.
   */
  create(dto: CreateMaterialCategoryDto): Promise<MaterialCategoryEntity> {
    return this.findOrCreateByName(
      dto.name,
      dto.defaultMeasurementType,
      dto.code,
    );
  }

  /**
   * Ada göre türü bulur, yoksa oluşturur. Stok girişinde kullanıcı var olmayan
   * bir tür yazdığında tek tek tanımlamaya gerek kalmadan açılır.
   */
  async findOrCreateByName(
    name: string,
    defaultMeasurementType?: MeasurementType,
    code?: string,
  ): Promise<MaterialCategoryEntity> {
    const key = normalizeName(name);
    if (!key) {
      throw new BadRequestException('Malzeme türü adı boş olamaz.');
    }
    const all = await this.findAll();
    const existing = all.find((c) => normalizeName(c.name) === key);
    if (existing) return existing;

    return this.categoriesRepo.save(
      this.categoriesRepo.create({
        name: cleanName(name),
        code: await this.uniqueCode(code || key, all),
        defaultMeasurementType,
      }),
    );
  }

  /**
   * `code` benzersiz bir sütundur; slug çakışırsa sonuna -2, -3… eklenir.
   * (Kod kullanıcıya görünmez, yalnızca teknik anahtardır.)
   */
  private async uniqueCode(
    base: string,
    existing: MaterialCategoryEntity[],
  ): Promise<string> {
    const slug =
      base
        .toLocaleLowerCase('tr')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'tur';
    const taken = new Set(existing.map((c) => c.code));
    if (!taken.has(slug)) return slug;
    for (let i = 2; i < 1000; i++) {
      if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
    }
    return `${slug}-${Date.now()}`;
  }

  findAll(): Promise<MaterialCategoryEntity[]> {
    return this.categoriesRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<MaterialCategoryEntity> {
    const category = await this.categoriesRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Malzeme türü bulunamadı.');
    }
    return category;
  }

  async update(
    id: string,
    dto: UpdateMaterialCategoryDto,
  ): Promise<MaterialCategoryEntity> {
    const category = await this.findOne(id);
    Object.assign(category, dto);
    return this.categoriesRepo.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    const inUse = await this.templatesRepo.count({
      where: { categoryId: id },
    });
    if (inUse > 0) {
      throw new ConflictException(
        'Bu malzeme türünü kullanan şablonlar var; önce onları taşıyın veya silin.',
      );
    }
    await this.categoriesRepo.softRemove(category);
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { cleanName, colorKey, normalizeName } from '../catalog-key.util';
import { MaterialColor } from '../entities/material-color.entity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { MaterialPlate } from '../entities/material-plate.entity';
import { MaterialBrand } from '../entities/material-brand.entity';
import { CreateMaterialColorDto } from '../dto/create-material-color.dto';
import { UpdateMaterialColorDto } from '../dto/update-material-color.dto';

@Injectable()
export class MaterialColorsService {
  constructor(
    @InjectRepository(MaterialColor)
    private readonly colorsRepo: Repository<MaterialColor>,
    @InjectRepository(MaterialTemplate)
    private readonly templatesRepo: Repository<MaterialTemplate>,
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
    @InjectRepository(MaterialBrand)
    private readonly brandsRepo: Repository<MaterialBrand>,
  ) {}

  /**
   * Renk ekler. Aynı kategoride aynı ad + aynı kod + aynı marka zaten varsa
   * yenisi açılmaz, mevcut kayıt döner; kodu ya da markası farklıysa ayrı
   * renktir (Beyaz 1001 ile Beyaz 2002 ikisi de listede kalır).
   */
  async create(dto: CreateMaterialColorDto): Promise<MaterialColor> {
    const name = cleanName(dto.name ?? '');
    if (!normalizeName(name)) {
      throw new BadRequestException('Renk adı boş olamaz.');
    }
    const brandId = dto.brandId || null;
    await this.assertBrand(dto.categoryId, brandId);
    const code = dto.code?.trim() || null;
    const key = colorKey({ name, code, brandId });
    const existing = (await this.findAll(dto.categoryId)).find((c) => colorKey(c) === key);
    if (existing) return existing;
    return this.colorsRepo.save(
      this.colorsRepo.create({ categoryId: dto.categoryId, name, code: code ?? undefined, brandId }),
    );
  }

  /**
   * Stok girişinde adla (ve varsa kodla) bulur, yoksa oluşturur. Kod
   * verildiyse ad + kod eşleşmeli (önce bu markanınki, sonra genel). Kod
   * yoksa kodsuz kayıt, o da yoksa o adda TEK renk varsa o kullanılır; aksi
   * halde kodsuz genel renk açılır (hangi kod olduğu bilinmiyor).
   */
  async findOrCreateByName(
    categoryId: string,
    name: string,
    code?: string,
    brandId?: string | null,
  ): Promise<MaterialColor> {
    const key = normalizeName(name);
    if (!key) {
      throw new BadRequestException('Renk adı boş olamaz.');
    }
    const brand = brandId ?? null;
    const codeKey = normalizeName(code);
    const sameName = (await this.findAll(categoryId)).filter((c) => normalizeName(c.name) === key);
    const usable = sameName.filter((c) => !c.brandId || c.brandId === brand);
    const byBrandFirst = (list: MaterialColor[]) =>
      list.find((c) => c.brandId === brand && brand) ?? list.find((c) => !c.brandId) ?? list[0];

    if (codeKey) {
      const hit = byBrandFirst(usable.filter((c) => normalizeName(c.code) === codeKey));
      if (hit) return hit;
      return this.colorsRepo.save(
        this.colorsRepo.create({ categoryId, name: cleanName(name), code: code!.trim(), brandId: brand }),
      );
    }
    const noCode = byBrandFirst(usable.filter((c) => !normalizeName(c.code)));
    if (noCode) return noCode;
    if (usable.length === 1) return usable[0];
    return this.colorsRepo.save(this.colorsRepo.create({ categoryId, name: cleanName(name) }));
  }

  findAll(categoryId?: string): Promise<MaterialColor[]> {
    return this.colorsRepo.find({
      where: categoryId ? { categoryId } : {},
      order: { name: 'ASC', code: 'ASC' },
    });
  }

  async findOne(id: string): Promise<MaterialColor> {
    const color = await this.colorsRepo.findOne({ where: { id } });
    if (!color) {
      throw new NotFoundException('Renk bulunamadı.');
    }
    return color;
  }

  async update(id: string, dto: UpdateMaterialColorDto): Promise<MaterialColor> {
    const color = await this.findOne(id);
    const next = {
      name: dto.name !== undefined ? cleanName(dto.name) : color.name,
      code: dto.code !== undefined ? dto.code?.trim() || null : color.code ?? null,
      brandId: dto.brandId !== undefined ? dto.brandId || null : color.brandId ?? null,
    };
    if (!normalizeName(next.name)) {
      throw new BadRequestException('Renk adı boş olamaz.');
    }
    await this.assertBrand(color.categoryId, next.brandId);
    const key = colorKey(next);
    const clash = (await this.findAll(color.categoryId)).find((c) => c.id !== id && colorKey(c) === key);
    if (clash) {
      throw new ConflictException(
        `Bu renk zaten var: ${clash.name}${clash.code ? ` ${clash.code}` : ''}. Farklı bir kod ya da marka seçin.`,
      );
    }
    await this.colorsRepo.update(id, {
      name: next.name,
      code: next.code as string | undefined,
      brandId: next.brandId,
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });
    // Kalemlerdeki ad/kod kopyası da güncellensin (listede ve aramada eski görünmesin).
    await this.platesRepo.update({ colorId: id }, { color: next.name, colorCode: (next.code ?? null) as string | undefined });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const color = await this.findOne(id);
    const [templateUse, plateUse] = await Promise.all([
      this.templatesRepo.count({ where: { defaultColorId: id } }),
      this.platesRepo.count({ where: { colorId: id } }),
    ]);
    if (templateUse > 0 || plateUse > 0) {
      throw new ConflictException(
        'Bu rengi kullanan şablon veya stok kalemi var; önce onları taşıyın veya silin.',
      );
    }
    await this.colorsRepo.softRemove(color);
  }

  /** Marka verildiyse rengin kategorisine ait olmalı. */
  private async assertBrand(categoryId: string, brandId: string | null): Promise<void> {
    if (!brandId) return;
    const brand = await this.brandsRepo.findOne({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadı.');
    if (brand.categoryId !== categoryId) {
      throw new BadRequestException('Seçilen marka bu malzeme türüne ait değil.');
    }
  }
}

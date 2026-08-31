import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { sizeKey } from '../catalog-key.util';
import { MaterialSize } from '../entities/material-size.entity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { MaterialPlate } from '../entities/material-plate.entity';
import { CreateMaterialSizeDto } from '../dto/create-material-size.dto';
import { UpdateMaterialSizeDto } from '../dto/update-material-size.dto';

@Injectable()
export class MaterialSizesService {
  constructor(
    @InjectRepository(MaterialSize)
    private readonly sizesRepo: Repository<MaterialSize>,
    @InjectRepository(MaterialTemplate)
    private readonly templatesRepo: Repository<MaterialTemplate>,
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
  ) {}

  /** Aynı kategoride aynı en×boy varsa yenisi açılmaz, mevcut kayıt döner. */
  create(dto: CreateMaterialSizeDto): Promise<MaterialSize> {
    return this.findOrCreate(dto.categoryId, dto.widthMm, dto.heightMm);
  }

  /** Ebada göre bulur, yoksa oluşturur (stok girişinde otomatik tanımlama). */
  async findOrCreate(
    categoryId: string,
    widthMm: number,
    heightMm: number,
  ): Promise<MaterialSize> {
    const key = sizeKey(widthMm, heightMm);
    const existing = (await this.findAll(categoryId)).find(
      (s) => sizeKey(s.widthMm, s.heightMm) === key,
    );
    if (existing) return existing;
    return this.sizesRepo.save(
      this.sizesRepo.create({ categoryId, widthMm, heightMm }),
    );
  }

  findAll(categoryId?: string): Promise<MaterialSize[]> {
    return this.sizesRepo.find({
      where: categoryId ? { categoryId } : {},
      order: { widthMm: 'ASC', heightMm: 'ASC' },
    });
  }

  async findOne(id: string): Promise<MaterialSize> {
    const size = await this.sizesRepo.findOne({ where: { id } });
    if (!size) {
      throw new NotFoundException('Ebat bulunamadı.');
    }
    return size;
  }

  async update(id: string, dto: UpdateMaterialSizeDto): Promise<MaterialSize> {
    const size = await this.findOne(id);
    Object.assign(size, dto);
    return this.sizesRepo.save(size);
  }

  async remove(id: string): Promise<void> {
    const size = await this.findOne(id);
    const [templateUse, plateUse] = await Promise.all([
      this.templatesRepo.count({ where: { defaultSizeId: id } }),
      this.platesRepo.count({ where: { sizeId: id } }),
    ]);
    if (templateUse > 0 || plateUse > 0) {
      throw new ConflictException(
        'Bu ebadı kullanan şablon veya stok kalemi var; önce onları taşıyın veya silin.',
      );
    }
    await this.sizesRepo.softRemove(size);
  }
}

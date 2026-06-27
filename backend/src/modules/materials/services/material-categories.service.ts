import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  create(dto: CreateMaterialCategoryDto): Promise<MaterialCategoryEntity> {
    return this.categoriesRepo.save(this.categoriesRepo.create(dto));
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

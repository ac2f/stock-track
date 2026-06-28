import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialBrand } from '../entities/material-brand.entity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { MaterialPlate } from '../entities/material-plate.entity';
import { CreateMaterialBrandDto } from '../dto/create-material-brand.dto';
import { UpdateMaterialBrandDto } from '../dto/update-material-brand.dto';

@Injectable()
export class MaterialBrandsService {
  constructor(
    @InjectRepository(MaterialBrand)
    private readonly brandsRepo: Repository<MaterialBrand>,
    @InjectRepository(MaterialTemplate)
    private readonly templatesRepo: Repository<MaterialTemplate>,
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
  ) {}

  create(dto: CreateMaterialBrandDto): Promise<MaterialBrand> {
    return this.brandsRepo.save(this.brandsRepo.create(dto));
  }

  findAll(categoryId?: string): Promise<MaterialBrand[]> {
    return this.brandsRepo.find({
      where: categoryId ? { categoryId } : {},
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<MaterialBrand> {
    const brand = await this.brandsRepo.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException('Marka bulunamadı.');
    }
    return brand;
  }

  async update(id: string, dto: UpdateMaterialBrandDto): Promise<MaterialBrand> {
    const brand = await this.findOne(id);
    Object.assign(brand, dto);
    return this.brandsRepo.save(brand);
  }

  async remove(id: string): Promise<void> {
    const brand = await this.findOne(id);
    const [templateUse, plateUse] = await Promise.all([
      this.templatesRepo.count({ where: { defaultBrandId: id } }),
      this.platesRepo.count({ where: { brandId: id } }),
    ]);
    if (templateUse > 0 || plateUse > 0) {
      throw new ConflictException(
        'Bu markayı kullanan şablon veya stok kalemi var; önce onları taşıyın veya silin.',
      );
    }
    await this.brandsRepo.softRemove(brand);
  }
}

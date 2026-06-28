import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialColor } from '../entities/material-color.entity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { MaterialPlate } from '../entities/material-plate.entity';
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
  ) {}

  create(dto: CreateMaterialColorDto): Promise<MaterialColor> {
    return this.colorsRepo.save(this.colorsRepo.create(dto));
  }

  findAll(categoryId?: string): Promise<MaterialColor[]> {
    return this.colorsRepo.find({
      where: categoryId ? { categoryId } : {},
      order: { name: 'ASC' },
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
    Object.assign(color, dto);
    return this.colorsRepo.save(color);
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
}

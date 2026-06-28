import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialThickness } from '../entities/material-thickness.entity';
import { MaterialTemplate } from '../entities/material-template.entity';
import { MaterialPlate } from '../entities/material-plate.entity';
import { CreateMaterialThicknessDto } from '../dto/create-material-thickness.dto';
import { UpdateMaterialThicknessDto } from '../dto/update-material-thickness.dto';

@Injectable()
export class MaterialThicknessesService {
  constructor(
    @InjectRepository(MaterialThickness)
    private readonly thicknessesRepo: Repository<MaterialThickness>,
    @InjectRepository(MaterialTemplate)
    private readonly templatesRepo: Repository<MaterialTemplate>,
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
  ) {}

  create(dto: CreateMaterialThicknessDto): Promise<MaterialThickness> {
    return this.thicknessesRepo.save(this.thicknessesRepo.create(dto));
  }

  findAll(categoryId?: string): Promise<MaterialThickness[]> {
    return this.thicknessesRepo.find({
      where: categoryId ? { categoryId } : {},
      order: { valueMm: 'ASC' },
    });
  }

  async findOne(id: string): Promise<MaterialThickness> {
    const thickness = await this.thicknessesRepo.findOne({ where: { id } });
    if (!thickness) {
      throw new NotFoundException('Kalınlık bulunamadı.');
    }
    return thickness;
  }

  async update(
    id: string,
    dto: UpdateMaterialThicknessDto,
  ): Promise<MaterialThickness> {
    const thickness = await this.findOne(id);
    Object.assign(thickness, dto);
    return this.thicknessesRepo.save(thickness);
  }

  async remove(id: string): Promise<void> {
    const thickness = await this.findOne(id);
    const [templateUse, plateUse] = await Promise.all([
      this.templatesRepo.count({ where: { defaultThicknessId: id } }),
      this.platesRepo.count({ where: { thicknessId: id } }),
    ]);
    if (templateUse > 0 || plateUse > 0) {
      throw new ConflictException(
        'Bu kalınlığı kullanan şablon veya stok kalemi var; önce onları taşıyın veya silin.',
      );
    }
    await this.thicknessesRepo.softRemove(thickness);
  }
}

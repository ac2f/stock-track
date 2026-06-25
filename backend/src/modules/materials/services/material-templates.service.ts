import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { MaterialCategory } from '../../../common/enums/material-category.enum';
import { MaterialTemplate } from '../entities/material-template.entity';
import { CreateMaterialTemplateDto } from '../dto/create-material-template.dto';
import { UpdateMaterialTemplateDto } from '../dto/update-material-template.dto';

@Injectable()
export class MaterialTemplatesService {
  constructor(
    @InjectRepository(MaterialTemplate)
    private readonly templatesRepo: Repository<MaterialTemplate>,
  ) {}

  create(dto: CreateMaterialTemplateDto): Promise<MaterialTemplate> {
    return this.templatesRepo.save(
      this.templatesRepo.create({
        ...dto,
        defaultAttributes: dto.defaultAttributes ?? {},
      }),
    );
  }

  findAll(filters: {
    category?: MaterialCategory;
    search?: string;
  }): Promise<MaterialTemplate[]> {
    const where: FindOptionsWhere<MaterialTemplate> = {};
    if (filters.category) {
      where.category = filters.category;
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
    Object.assign(template, dto);
    return this.templatesRepo.save(template);
  }

  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);
    await this.templatesRepo.softRemove(template);
  }
}

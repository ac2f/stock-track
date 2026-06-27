import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { MaterialTemplate } from '../entities/material-template.entity';
import { CreateMaterialTemplateDto } from '../dto/create-material-template.dto';
import { UpdateMaterialTemplateDto } from '../dto/update-material-template.dto';
import { MaterialCategoriesService } from './material-categories.service';

@Injectable()
export class MaterialTemplatesService {
  constructor(
    @InjectRepository(MaterialTemplate)
    private readonly templatesRepo: Repository<MaterialTemplate>,
    private readonly categoriesService: MaterialCategoriesService,
  ) {}

  async create(dto: CreateMaterialTemplateDto): Promise<MaterialTemplate> {
    await this.categoriesService.findOne(dto.categoryId);
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
    if (dto.categoryId) {
      await this.categoriesService.findOne(dto.categoryId);
    }
    Object.assign(template, dto);
    return this.templatesRepo.save(template);
  }

  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);
    await this.templatesRepo.softRemove(template);
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessingRate } from '../entities/processing-rate.entity';
import { CreateProcessingRateDto } from '../dto/create-processing-rate.dto';
import { UpdateProcessingRateDto } from '../dto/update-processing-rate.dto';

@Injectable()
export class ProcessingRatesService {
  constructor(
    @InjectRepository(ProcessingRate)
    private readonly ratesRepo: Repository<ProcessingRate>,
  ) {}

  async create(dto: CreateProcessingRateDto): Promise<ProcessingRate> {
    if (dto.isDefault) {
      await this.clearDefault();
    }
    return this.ratesRepo.save(this.ratesRepo.create(dto));
  }

  findAll(): Promise<ProcessingRate[]> {
    return this.ratesRepo.find({
      where: { isActive: true },
      order: { isDefault: 'DESC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ProcessingRate> {
    const rate = await this.ratesRepo.findOne({ where: { id } });
    if (!rate) {
      throw new NotFoundException('İşleme tarifesi bulunamadı.');
    }
    return rate;
  }

  findDefault(): Promise<ProcessingRate | null> {
    return this.ratesRepo.findOne({ where: { isDefault: true } });
  }

  async update(
    id: string,
    dto: UpdateProcessingRateDto,
  ): Promise<ProcessingRate> {
    const rate = await this.findOne(id);
    if (dto.isDefault) {
      await this.clearDefault();
    }
    Object.assign(rate, dto);
    return this.ratesRepo.save(rate);
  }

  async remove(id: string): Promise<void> {
    const rate = await this.findOne(id);
    await this.ratesRepo.softRemove(rate);
  }

  private async clearDefault(): Promise<void> {
    await this.ratesRepo.update({ isDefault: true }, { isDefault: false });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliersRepo: Repository<Supplier>,
  ) {}

  create(dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliersRepo.save(this.suppliersRepo.create(dto));
  }

  findAll(search?: string): Promise<Supplier[]> {
    return this.suppliersRepo.find({
      where: search ? { name: ILike(`%${search}%`) } : {},
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Supplier> {
    const supplier = await this.suppliersRepo.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Tedarikçi bulunamadı.');
    }
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOne(id);
    Object.assign(supplier, dto);
    return this.suppliersRepo.save(supplier);
  }

  async remove(id: string): Promise<void> {
    const supplier = await this.findOne(id);
    await this.suppliersRepo.softRemove(supplier);
  }
}

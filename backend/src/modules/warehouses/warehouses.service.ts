import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehousesRepo: Repository<Warehouse>,
  ) {}

  create(dto: CreateWarehouseDto): Promise<Warehouse> {
    return this.warehousesRepo.save(this.warehousesRepo.create(dto));
  }

  findAll(): Promise<Warehouse[]> {
    return this.warehousesRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Warehouse> {
    const warehouse = await this.warehousesRepo.findOne({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('Depo bulunamadı.');
    }
    return warehouse;
  }

  /**
   * Varsayılan depoyu döndürür; yoksa verilen kodla oluşturur (idempotent).
   * Satın alma/işleme/satışta depo belirtilmediğinde kullanılır.
   * Opsiyonel EntityManager ile transaction içinden çağrılabilir.
   */
  async resolveDefault(
    code: string,
    manager?: EntityManager,
  ): Promise<Warehouse> {
    const repo = manager
      ? manager.getRepository(Warehouse)
      : this.warehousesRepo;
    let warehouse = await repo.findOne({ where: { code } });
    if (!warehouse) {
      warehouse = await repo.save(
        repo.create({ name: 'Merkez Depo', code, isActive: true }),
      );
    }
    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<Warehouse> {
    const warehouse = await this.findOne(id);
    Object.assign(warehouse, dto);
    return this.warehousesRepo.save(warehouse);
  }

  async remove(id: string): Promise<void> {
    const warehouse = await this.findOne(id);
    await this.warehousesRepo.softRemove(warehouse);
  }
}

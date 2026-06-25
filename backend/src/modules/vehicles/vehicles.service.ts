import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehiclesRepo: Repository<Vehicle>,
  ) {}

  create(dto: CreateVehicleDto): Promise<Vehicle> {
    return this.vehiclesRepo.save(this.vehiclesRepo.create(dto));
  }

  findAll(): Promise<Vehicle[]> {
    return this.vehiclesRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.vehiclesRepo.findOne({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException('Araç bulunamadı.');
    }
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    Object.assign(vehicle, dto);
    return this.vehiclesRepo.save(vehicle);
  }

  async remove(id: string): Promise<void> {
    const vehicle = await this.findOne(id);
    await this.vehiclesRepo.softRemove(vehicle);
  }
}

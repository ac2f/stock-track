import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Machine } from '../entities/machine.entity';
import { CreateMachineDto } from '../dto/create-machine.dto';
import { UpdateMachineDto } from '../dto/update-machine.dto';

@Injectable()
export class MachinesService {
  constructor(
    @InjectRepository(Machine)
    private readonly machinesRepo: Repository<Machine>,
  ) {}

  create(dto: CreateMachineDto): Promise<Machine> {
    return this.machinesRepo.save(this.machinesRepo.create(dto));
  }

  findAll(): Promise<Machine[]> {
    return this.machinesRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Machine> {
    const machine = await this.machinesRepo.findOne({ where: { id } });
    if (!machine) {
      throw new NotFoundException('Makine bulunamadı.');
    }
    return machine;
  }

  async update(id: string, dto: UpdateMachineDto): Promise<Machine> {
    const machine = await this.findOne(id);
    Object.assign(machine, dto);
    return this.machinesRepo.save(machine);
  }

  async remove(id: string): Promise<void> {
    const machine = await this.findOne(id);
    await this.machinesRepo.softRemove(machine);
  }
}

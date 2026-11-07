import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MachineTypesService } from '../../platform/machine-types.service';
import { Machine } from '../entities/machine.entity';
import { CreateMachineDto } from '../dto/create-machine.dto';
import { UpdateMachineDto } from '../dto/update-machine.dto';

@Injectable()
export class MachinesService {
  constructor(
    @InjectRepository(Machine)
    private readonly machinesRepo: Repository<Machine>,
    private readonly machineTypes: MachineTypesService,
  ) {}

  async create(dto: CreateMachineDto): Promise<Machine> {
    const clean = await this.normalize(dto);
    return this.machinesRepo.save(this.machinesRepo.create(clean));
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
    Object.assign(machine, await this.normalize(dto, machine));
    return this.machinesRepo.save(machine);
  }

  async remove(id: string): Promise<void> {
    const machine = await this.findOne(id);
    await this.machinesRepo.softRemove(machine);
  }

  /**
   * Rehber alanlarını doğrular: makine türü platformda var ve etkin mi, ebat bu
   * türe mi ait; ebat seçildiyse çalışma alanı ondan gelir; en/boy birlikte verilir.
   */
  private async normalize<T extends Partial<CreateMachineDto>>(dto: T, current?: Machine): Promise<T> {
    const out: Partial<CreateMachineDto> = { ...dto };
    const typeId = dto.machineTypeId !== undefined ? dto.machineTypeId : current?.machineTypeId ?? null;

    if (dto.machineTypeId === null) {
      // Türü kaldırınca hazır ebat bağı da kalkar (en/boy kalır).
      out.sizeId = null;
    } else if (typeId) {
      const sizeId = dto.sizeId !== undefined ? dto.sizeId : dto.machineTypeId !== undefined ? null : current?.sizeId ?? null;
      const dims = await this.machineTypes.assertForMachine(typeId, sizeId);
      out.sizeId = sizeId ?? null;
      if (dims) {
        out.workWidthMm = dims.widthMm;
        out.workHeightMm = dims.heightMm;
      }
    } else if (dto.sizeId) {
      throw new BadRequestException('Hazır ebat seçmek için önce makine türünü seçin.');
    }

    const w = out.workWidthMm !== undefined ? out.workWidthMm : current?.workWidthMm ?? null;
    const h = out.workHeightMm !== undefined ? out.workHeightMm : current?.workHeightMm ?? null;
    if ((w == null) !== (h == null)) {
      throw new BadRequestException('Çalışma alanının hem enini hem boyunu girin.');
    }
    for (const key of ['brand', 'model', 'notes'] as const) {
      const v = out[key];
      if (typeof v === 'string') out[key] = v.trim() || null;
    }
    return out as T;
  }
}

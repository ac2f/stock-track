import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from '../settings/entities/system-setting.entity';
import { UpdatePlatformSettingsDto } from './dto/platform.dto';

export interface PlatformSettingsView {
  registrationOpen: boolean;
  registrationAutoApprove: boolean;
  trialDays: number;
}

/** Platform (kiralama) ayarları: kayıt açık mı, onay gerekir mi, deneme süresi. */
@Injectable()
export class PlatformSettingsService {
  constructor(@InjectRepository(SystemSetting) private readonly repo: Repository<SystemSetting>) {}

  private async row(): Promise<SystemSetting> {
    const [existing] = await this.repo.find({ order: { createdAt: 'ASC' }, take: 1 });
    return existing ?? this.repo.save(this.repo.create({}));
  }

  async get(): Promise<PlatformSettingsView> {
    const s = await this.row();
    return {
      registrationOpen: s.registrationOpen,
      registrationAutoApprove: s.registrationAutoApprove,
      trialDays: s.trialDays,
    };
  }

  async update(dto: UpdatePlatformSettingsDto): Promise<PlatformSettingsView> {
    const s = await this.row();
    if (dto.registrationOpen !== undefined) s.registrationOpen = dto.registrationOpen;
    if (dto.registrationAutoApprove !== undefined) s.registrationAutoApprove = dto.registrationAutoApprove;
    if (dto.trialDays !== undefined) s.trialDays = dto.trialDays;
    await this.repo.save(s);
    return this.get();
  }
}

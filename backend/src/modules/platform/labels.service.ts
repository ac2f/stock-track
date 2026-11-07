import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CacheGroup, GLOBAL_SCOPE } from '../../common/cache/cache.groups';
import { CacheService } from '../../common/cache/cache.service';
import { CreateLabelDto, UpdateLabelDto } from './dto/platform.dto';
import { BusinessLabel } from './entities/business-label.entity';
import { ShopLabel } from './entities/shop-label.entity';

export interface LabelView {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  /** Bu etiketi seçen işletme sayısı (yalnız yönetici ekranında). */
  shopCount?: number;
}

/**
 * İşletme etiketleri. Yönetici tanımlar/düzenler; işletmeler kayıtta ve
 * profillerinde bunlardan seçer; rehber etikete göre süzer.
 */
@Injectable()
export class LabelsService {
  constructor(
    @InjectRepository(BusinessLabel) private readonly labels: Repository<BusinessLabel>,
    @InjectRepository(ShopLabel) private readonly shopLabels: Repository<ShopLabel>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  /** Kayıt formu ve profil için: yalnız etkin etiketler (herkese açık). */
  publicList(): Promise<LabelView[]> {
    return this.cache.wrap(GLOBAL_SCOPE, CacheGroup.PLATFORM, 'labels:public', 300, async () => {
      const rows = await this.labels.find({
        where: { isActive: true },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
      return rows.map((l) => this.view(l));
    });
  }

  /** Yönetici: pasifler dahil, seçen işletme sayısıyla. */
  async adminList(): Promise<LabelView[]> {
    const rows = await this.labels.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
    const counts: { label_id: string; n: string }[] = await this.dataSource.query(
      `SELECT sl.label_id, COUNT(*) AS n FROM shop_labels sl
         JOIN shops s ON s.id = sl.shop_id AND s.deleted_at IS NULL
        GROUP BY sl.label_id`,
    );
    const byLabel = new Map(counts.map((c) => [c.label_id, Number(c.n)]));
    return rows.map((l) => ({ ...this.view(l), shopCount: byLabel.get(l.id) ?? 0 }));
  }

  async create(dto: CreateLabelDto): Promise<LabelView> {
    await this.assertNameFree(dto.name);
    const saved = await this.labels.save(
      this.labels.create({
        name: dto.name,
        description: dto.description ?? '',
        sortOrder: dto.sortOrder ?? (await this.labels.count()) * 10,
      }),
    );
    return this.view(saved);
  }

  async update(id: string, dto: UpdateLabelDto): Promise<LabelView> {
    const label = await this.find(id);
    if (dto.name !== undefined && dto.name !== label.name) {
      await this.assertNameFree(dto.name, id);
      label.name = dto.name;
    }
    if (dto.description !== undefined) label.description = dto.description;
    if (dto.sortOrder !== undefined) label.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) label.isActive = dto.isActive;
    return this.view(await this.labels.save(label));
  }

  /** Siler; işletmelerdeki seçimleri de kalkar. Geçici kapatmak için pasife alın. */
  async remove(id: string): Promise<void> {
    const label = await this.find(id);
    await this.dataSource.transaction(async (m) => {
      await m.delete(ShopLabel, { labelId: id });
      await m.softRemove(label);
    });
  }

  /** Verilen kimliklerin hepsi var ve etkin mi? Değilse hata. */
  async assertUsable(ids: string[]): Promise<BusinessLabel[]> {
    const unique = [...new Set(ids)];
    const rows = unique.length ? await this.labels.find({ where: { id: In(unique), isActive: true } }) : [];
    if (rows.length !== unique.length) {
      throw new NotFoundException('Seçilen iş kollarından biri artık kullanılamıyor; listeyi yenileyin.');
    }
    return rows;
  }

  private async find(id: string): Promise<BusinessLabel> {
    const l = await this.labels.findOne({ where: { id } });
    if (!l) throw new NotFoundException('Etiket bulunamadı.');
    return l;
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT id FROM business_labels WHERE deleted_at IS NULL AND lower(name) = lower($1)`,
      [name],
    );
    if (rows.some((r) => r.id !== exceptId)) {
      throw new ConflictException('Bu adda bir etiket zaten var.');
    }
  }

  private view(l: BusinessLabel): LabelView {
    return { id: l.id, name: l.name, description: l.description, sortOrder: l.sortOrder, isActive: l.isActive };
  }
}

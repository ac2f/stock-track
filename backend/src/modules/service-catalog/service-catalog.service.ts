import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { ServiceGroup } from './entities/service-group.entity';
import { ServiceType } from './entities/service-type.entity';
import { ServiceTier } from './entities/service-tier.entity';
import { ServiceBundle } from './entities/service-bundle.entity';
import {
  CreateServiceBundleDto,
  CreateServiceGroupDto,
  CreateServiceTypeDto,
  UpdateServiceBundleDto,
  UpdateServiceGroupDto,
  UpdateServiceTypeDto,
} from './dto/service-catalog.dto';
import { pickTier } from './service-catalog.util';

export interface ServiceCatalog {
  groups: (ServiceGroup & { types: ServiceType[] })[];
  bundles: ServiceBundle[];
}

/**
 * Hizmet kataloğu: gruplar → hizmet türleri → fiyat kademeleri, ve kombinasyon indirimleri.
 * Teklif hizmet kalemini buradan fiyatlar (QuotesService), onaylanınca iş kuyruğa düşer.
 */
@Injectable()
export class ServiceCatalogService {
  constructor(
    @InjectRepository(ServiceGroup) private readonly groups: Repository<ServiceGroup>,
    @InjectRepository(ServiceType) private readonly types: Repository<ServiceType>,
    @InjectRepository(ServiceTier) private readonly tiers: Repository<ServiceTier>,
    @InjectRepository(ServiceBundle) private readonly bundles: Repository<ServiceBundle>,
    private readonly dataSource: DataSource,
  ) {}

  /** Bütün katalog (yönetim ekranı ve teklif formu): sıralı, kademeleriyle. */
  async catalog(activeOnly = false): Promise<ServiceCatalog> {
    await this.seedDefaults(); // (ilk açılışta örnek katalog; sonra hiç)
    const [groups, types, bundles] = await Promise.all([
      this.groups.find({ where: activeOnly ? { isActive: true } : {}, order: { sortOrder: 'ASC', name: 'ASC' } }),
      this.types.find({
        where: activeOnly ? { isActive: true } : {},
        relations: { tiers: true },
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
      this.bundles.find({ where: activeOnly ? { isActive: true } : {}, order: { name: 'ASC' } }),
    ]);
    for (const t of types) {
      t.tiers = (t.tiers ?? []).sort(
        (a, b) => a.sortOrder - b.sortOrder || (a.minMeasure ?? -1) - (b.minMeasure ?? -1),
      );
    }
    return {
      groups: groups.map((g) => Object.assign(g, { types: types.filter((t) => t.groupId === g.id) })),
      bundles,
    };
  }

  // ── gruplar ──
  async createGroup(dto: CreateServiceGroupDto): Promise<ServiceGroup> {
    await this.uniqueGroup(dto.name);
    return this.groups.save(this.groups.create({ ...dto, name: dto.name.trim() }));
  }

  async updateGroup(id: string, dto: UpdateServiceGroupDto): Promise<ServiceGroup> {
    const g = await this.groups.findOne({ where: { id } });
    if (!g) throw new NotFoundException('Hizmet grubu bulunamadı.');
    if (dto.name && dto.name.trim() !== g.name) await this.uniqueGroup(dto.name, id);
    Object.assign(g, dto, dto.name ? { name: dto.name.trim() } : {});
    return this.groups.save(g);
  }

  async removeGroup(id: string): Promise<void> {
    const g = await this.groups.findOne({ where: { id } });
    if (!g) throw new NotFoundException('Hizmet grubu bulunamadı.');
    if (await this.types.count({ where: { groupId: id } })) {
      throw new BadRequestException('Grupta hizmet var: önce hizmetleri silin ya da başka gruba taşıyın.');
    }
    await this.groups.softRemove(g);
  }

  private async uniqueGroup(name: string, exceptId?: string) {
    const same = await this.groups.findOne({ where: { name: name.trim() } });
    if (same && same.id !== exceptId) throw new BadRequestException(`"${name.trim()}" adlı bir grup zaten var.`);
  }

  // ── hizmet türleri (kademeleriyle) ──
  async createType(dto: CreateServiceTypeDto): Promise<ServiceType> {
    await this.mustGroup(dto.groupId);
    this.checkTiers(dto.tiers);
    return this.dataSource.transaction(async (m) => {
      const { tiers, ...fields } = dto;
      const t = await m.save(m.create(ServiceType, { ...fields, name: dto.name.trim(), measureLabel: dto.measureLabel?.trim() || null }));
      await m.save(tiers.map((x, i) => m.create(ServiceTier, { ...x, id: undefined, typeId: t.id, sortOrder: i, currency: (x.currency ?? 'TRY').toUpperCase() })));
      return this.getType(t.id, m.getRepository(ServiceType));
    });
  }

  async updateType(id: string, dto: UpdateServiceTypeDto): Promise<ServiceType> {
    const t = await this.getType(id);
    if (dto.groupId) await this.mustGroup(dto.groupId);
    if (dto.tiers) this.checkTiers(dto.tiers);
    return this.dataSource.transaction(async (m) => {
      const { tiers, ...fields } = dto;
      Object.assign(t, fields);
      if (fields.name) t.name = fields.name.trim();
      if (fields.measureLabel !== undefined) t.measureLabel = fields.measureLabel?.trim() || null;
      delete t.tiers;
      await m.save(t);
      if (tiers) {
        const keep = tiers.map((x) => x.id).filter((x): x is string => !!x);
        const old = await m.find(ServiceTier, { where: { typeId: id } });
        const gone = old.filter((o) => !keep.includes(o.id));
        if (gone.length) await m.softRemove(gone);
        await m.save(
          tiers.map((x, i) =>
            m.create(ServiceTier, {
              ...x,
              id: x.id && old.some((o) => o.id === x.id) ? x.id : undefined,
              typeId: id,
              sortOrder: i,
              minMeasure: x.minMeasure ?? null,
              maxMeasure: x.maxMeasure ?? null,
              unit: x.unit ?? null,
              currency: (x.currency ?? 'TRY').toUpperCase(),
            }),
          ),
        );
      }
      return this.getType(id, m.getRepository(ServiceType));
    });
  }

  async removeType(id: string): Promise<void> {
    const t = await this.getType(id);
    await this.dataSource.transaction(async (m) => {
      if (t.tiers?.length) await m.softRemove(t.tiers);
      delete t.tiers;
      await m.softRemove(t);
    });
  }

  async getType(id: string, repo: Repository<ServiceType> = this.types): Promise<ServiceType> {
    const t = await repo.findOne({ where: { id }, relations: { tiers: true, group: true } });
    if (!t) throw new NotFoundException('Hizmet bulunamadı.');
    t.tiers = (t.tiers ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    return t;
  }

  /** Teklif kalemi için: hizmet türü ve (verilen ya da ölçüye uyan) kademe. */
  async resolveLine(typeId: string, tierId?: string | null, measure?: number | null): Promise<{ type: ServiceType; tier: ServiceTier | null }> {
    const type = await this.getType(typeId);
    const tiers = type.tiers ?? [];
    const tier = tierId ? tiers.find((x) => x.id === tierId) ?? null : pickTier(tiers, measure ?? null);
    if (tierId && !tier) throw new BadRequestException(`"${type.name}" hizmetinin seçilen kademesi bulunamadı.`);
    return { type, tier };
  }

  private async mustGroup(id: string) {
    if (!(await this.groups.findOne({ where: { id } }))) throw new BadRequestException('Hizmet grubu bulunamadı.');
  }

  private checkTiers(tiers: { name: string; minMeasure?: number | null; maxMeasure?: number | null }[]) {
    for (const t of tiers) {
      if (t.minMeasure != null && t.maxMeasure != null && Number(t.maxMeasure) <= Number(t.minMeasure)) {
        throw new BadRequestException(`"${t.name}" kademesinde üst sınır alt sınırdan büyük olmalı.`);
      }
    }
  }

  // ── kombinasyon indirimleri ──
  /** Paketin hizmet türleri (silinmiş paket de: dönüşümde teklifteki indirim dağıtılırken). */
  async bundleTypeIds(id: string): Promise<string[] | null> {
    const b = await this.bundles.findOne({ where: { id }, withDeleted: true });
    return b ? b.serviceTypeIds : null;
  }

  activeBundles(): Promise<ServiceBundle[]> {
    return this.bundles.find({ where: { isActive: true } });
  }

  async createBundle(dto: CreateServiceBundleDto): Promise<ServiceBundle> {
    await this.checkBundle(dto.serviceTypeIds, dto.discountKind, dto.discountValue);
    return this.bundles.save(this.bundles.create({ ...dto, name: dto.name.trim(), serviceTypeIds: [...new Set(dto.serviceTypeIds)] }));
  }

  async updateBundle(id: string, dto: UpdateServiceBundleDto): Promise<ServiceBundle> {
    const b = await this.bundles.findOne({ where: { id } });
    if (!b) throw new NotFoundException('İndirim bulunamadı.');
    Object.assign(b, dto);
    if (dto.name) b.name = dto.name.trim();
    if (dto.serviceTypeIds) b.serviceTypeIds = [...new Set(dto.serviceTypeIds)];
    await this.checkBundle(b.serviceTypeIds, b.discountKind, Number(b.discountValue));
    return this.bundles.save(b);
  }

  async removeBundle(id: string): Promise<void> {
    const b = await this.bundles.findOne({ where: { id } });
    if (!b) throw new NotFoundException('İndirim bulunamadı.');
    await this.bundles.softRemove(b);
  }

  private async checkBundle(ids: string[], kind: string, value: number) {
    const uniq = [...new Set(ids)];
    if (uniq.length < 2) throw new BadRequestException('Kombinasyon en az iki farklı hizmetten oluşur.');
    if (kind === 'percent' && value > 100) throw new BadRequestException('Yüzde indirim 100\'ü geçemez.');
    const found = await this.types.count({ where: { id: In(uniq) } });
    if (found !== uniq.length) throw new BadRequestException('Seçilen hizmetlerden biri bulunamadı.');
  }

  /** Dükkânın ilk açılışında örnek katalog (yalnız katalog boşsa): düzenlenebilir, silinebilir. */
  async seedDefaults(): Promise<void> {
    if (await this.groups.count({ withDeleted: true })) return;
    const harf = await this.groups.save(this.groups.create({ name: 'Harf İşleri', sortOrder: 0 }));
    const montaj = await this.groups.save(this.groups.create({ name: 'Montaj', sortOrder: 1 }));
    const baski = await this.groups.save(this.groups.create({ name: 'Baskı & Uygulama', sortOrder: 2 }));
    const bukum = await this.createType({
      groupId: harf.id, name: 'Harf büküm', unit: MeasurementType.LENGTH, measureLabel: null,
      tiers: [{ name: 'Standart', price: 120 }],
    });
    const yapistirma = await this.createType({
      groupId: harf.id, name: 'Harf yapıştırma', unit: MeasurementType.PIECE, measureLabel: 'Harf boyu (cm)',
      tiers: [
        { name: '10 cm altı', maxMeasure: 10, price: 15 },
        { name: '10–30 cm', minMeasure: 10, maxMeasure: 30, price: 25 },
        { name: '30 cm ve üstü (metre)', minMeasure: 30, unit: MeasurementType.LENGTH, price: 90 },
      ],
    });
    await this.createType({
      groupId: montaj.id, name: 'Tabela montajı', unit: MeasurementType.AREA, measureLabel: null,
      tiers: [{ name: 'Zemin kat', price: 400 }],
    });
    await this.createType({
      groupId: baski.id, name: 'Folyo uygulama', unit: MeasurementType.AREA, measureLabel: null,
      tiers: [{ name: 'Standart', price: 180 }],
    });
    await this.bundles.save(
      this.bundles.create({ name: 'Büküm + yapıştırma', serviceTypeIds: [bukum.id, yapistirma.id], discountKind: 'percent', discountValue: 10 }),
    );
  }
}

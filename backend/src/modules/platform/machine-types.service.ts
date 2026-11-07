import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CacheGroup, GLOBAL_SCOPE } from '../../common/cache/cache.groups';
import { CacheService } from '../../common/cache/cache.service';
import { ShopContext } from '../../common/shop/shop-context';
import {
  CreateMachineTypeDto,
  CreateMachineTypeSizeDto,
  UpdateMachineTypeDto,
  UpdateMachineTypeSizeDto,
} from './dto/platform.dto';
import { MachineTypeSize } from './entities/machine-type-size.entity';
import { MachineType } from './entities/machine-type.entity';
import { BusinessLabel } from './entities/business-label.entity';

export interface MachineTypeSizeView {
  id: string;
  widthMm: number;
  heightMm: number;
  label: string;
}

export interface MachineTypeView {
  id: string;
  name: string;
  parentId: string | null;
  labelId: string | null;
  /** "Lazer › Fiber lazer" */
  path: string;
  depth: number;
  description: string;
  sortOrder: number;
  isActive: boolean;
  sizes: MachineTypeSizeView[];
  /** Yalnız yönetici ekranında: bu türe (alt türleri dahil) bağlı makine sayısı. */
  machineCount?: number;
}

/**
 * Makine türleri (ağaç) ve standart ebatları. Yönetici envanterde görülen
 * makinelere göre alt kategoriler ve ebatlar ekler; işletmeler makinelerini
 * buna bağlar (rehberde "şu ebatı kesebilen makinesi olan işletme" aranır).
 */
@Injectable()
export class MachineTypesService {
  constructor(
    @InjectRepository(MachineType) private readonly types: Repository<MachineType>,
    @InjectRepository(MachineTypeSize) private readonly sizes: Repository<MachineTypeSize>,
    @InjectRepository(BusinessLabel) private readonly labels: Repository<BusinessLabel>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: CacheService,
  ) {}

  /** İşletmelerin makine formu ve rehber süzgeci: etkin türler, ağaç sırasıyla. */
  memberList(): Promise<MachineTypeView[]> {
    return this.cache.wrap(GLOBAL_SCOPE, CacheGroup.PLATFORM, 'machine-types:active', 300, async () =>
      (await this.flat()).filter((t) => t.isActive),
    );
  }

  /** Yönetici: pasifler dahil + makine sayıları. */
  async adminList(): Promise<MachineTypeView[]> {
    const all = await this.flat();
    const rows: { machine_type_id: string; n: string }[] = await ShopContext.unscoped(() =>
      this.dataSource.query(
        `SELECT machine_type_id, COUNT(*) AS n FROM machines
          WHERE deleted_at IS NULL AND machine_type_id IS NOT NULL GROUP BY machine_type_id`,
      ),
    );
    const direct = new Map(rows.map((r) => [r.machine_type_id, Number(r.n)]));
    return all.map((t) => ({
      ...t,
      machineCount: this.descendantIds(all, t.id).reduce((s, id) => s + (direct.get(id) ?? 0), 0),
    }));
  }

  /** Bir türün kendisi ve bütün alt türlerinin kimlikleri. */
  async descendantsOf(id: string): Promise<string[]> {
    return this.descendantIds(await this.flat(), id);
  }

  async create(dto: CreateMachineTypeDto): Promise<MachineTypeView> {
    await this.assertParent(dto.parentId ?? null, undefined);
    await this.assertLabel(dto.labelId ?? null);
    await this.assertNameFree(dto.name, dto.parentId ?? null);
    const saved = await this.types.save(
      this.types.create({
        name: dto.name,
        parentId: dto.parentId ?? null,
        labelId: dto.labelId ?? null,
        description: dto.description ?? '',
        sortOrder: dto.sortOrder ?? (await this.types.count()) * 10,
      }),
    );
    return this.one(saved.id);
  }

  async update(id: string, dto: UpdateMachineTypeDto): Promise<MachineTypeView> {
    const type = await this.find(id);
    const parentId = dto.parentId !== undefined ? dto.parentId : type.parentId ?? null;
    if (dto.parentId !== undefined) await this.assertParent(dto.parentId, id);
    if (dto.labelId !== undefined) await this.assertLabel(dto.labelId);
    const name = dto.name ?? type.name;
    if (dto.name !== undefined || dto.parentId !== undefined) await this.assertNameFree(name, parentId, id);

    if (dto.name !== undefined) type.name = dto.name;
    if (dto.parentId !== undefined) type.parentId = dto.parentId;
    if (dto.labelId !== undefined) type.labelId = dto.labelId;
    if (dto.description !== undefined) type.description = dto.description;
    if (dto.sortOrder !== undefined) type.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) type.isActive = dto.isActive;
    await this.types.save(type);
    return this.one(id);
  }

  /**
   * Siler (alt türü varsa reddeder). Türe bağlı işletme makineleri silinmez,
   * yalnız türleri boşalır; rehberden kalkarlar.
   */
  async remove(id: string): Promise<void> {
    const type = await this.find(id);
    const children = await this.types.count({ where: { parentId: id } });
    if (children > 0) {
      throw new BadRequestException('Önce bu türün alt türlerini silin ya da başka türe taşıyın.');
    }
    await this.dataSource.transaction(async (m) => {
      await ShopContext.unscoped(() =>
        m.query(`UPDATE machines SET machine_type_id = NULL, size_id = NULL WHERE machine_type_id = $1`, [id]),
      );
      await m.softDelete(MachineTypeSize, { machineTypeId: id });
      await m.softRemove(type);
    });
  }

  // ── Ebatlar ──────────────────────────────────────────────────────────

  async addSize(typeId: string, dto: CreateMachineTypeSizeDto): Promise<MachineTypeView> {
    await this.find(typeId);
    await this.assertSizeFree(typeId, dto.widthMm, dto.heightMm);
    await this.sizes.save(
      this.sizes.create({
        machineTypeId: typeId,
        widthMm: dto.widthMm,
        heightMm: dto.heightMm,
        label: dto.label ?? '',
        sortOrder: dto.sortOrder ?? dto.widthMm,
      }),
    );
    return this.one(typeId);
  }

  async updateSize(sizeId: string, dto: UpdateMachineTypeSizeDto): Promise<MachineTypeView> {
    const size = await this.sizes.findOne({ where: { id: sizeId } });
    if (!size) throw new NotFoundException('Ebat bulunamadı.');
    const w = dto.widthMm ?? size.widthMm;
    const h = dto.heightMm ?? size.heightMm;
    if (w !== size.widthMm || h !== size.heightMm) await this.assertSizeFree(size.machineTypeId, w, h, sizeId);
    size.widthMm = w;
    size.heightMm = h;
    if (dto.label !== undefined) size.label = dto.label;
    if (dto.sortOrder !== undefined) size.sortOrder = dto.sortOrder;
    await this.sizes.save(size);
    // Bu ebada bağlı makinelerin ölçüleri de güncel kalsın.
    await ShopContext.unscoped(() =>
      this.dataSource.query(`UPDATE machines SET work_width_mm = $2, work_height_mm = $3 WHERE size_id = $1`, [sizeId, w, h]),
    );
    return this.one(size.machineTypeId);
  }

  async removeSize(sizeId: string): Promise<MachineTypeView> {
    const size = await this.sizes.findOne({ where: { id: sizeId } });
    if (!size) throw new NotFoundException('Ebat bulunamadı.');
    // Makineler ebat bilgisini (en/boy) korur; yalnız hazır ebat bağı kalkar.
    await ShopContext.unscoped(() =>
      this.dataSource.query(`UPDATE machines SET size_id = NULL WHERE size_id = $1`, [sizeId]),
    );
    await this.sizes.softRemove(size);
    return this.one(size.machineTypeId);
  }

  /** İşletme makinesi için: tür var/etkin mi, ebat bu türe mi ait? Ebat varsa en/boyu döner. */
  async assertForMachine(
    typeId: string,
    sizeId?: string | null,
  ): Promise<{ widthMm: number; heightMm: number } | null> {
    const type = await this.types.findOne({ where: { id: typeId, isActive: true } });
    if (!type) throw new NotFoundException('Seçilen makine türü bulunamadı ya da kapalı.');
    if (!sizeId) return null;
    const size = await this.sizes.findOne({ where: { id: sizeId, machineTypeId: typeId } });
    if (!size) throw new BadRequestException('Seçilen ebat bu makine türüne ait değil.');
    return { widthMm: size.widthMm, heightMm: size.heightMm };
  }

  // ── İç ───────────────────────────────────────────────────────────────

  private async one(id: string): Promise<MachineTypeView> {
    const t = (await this.flat()).find((x) => x.id === id);
    if (!t) throw new NotFoundException('Makine türü bulunamadı.');
    return t;
  }

  /** Bütün türler (pasifler dahil), ağaç sırasıyla: kök, altındakiler, sonraki kök ... */
  private async flat(): Promise<MachineTypeView[]> {
    const [types, sizes] = await Promise.all([
      this.types.find({ order: { sortOrder: 'ASC', name: 'ASC' } }),
      this.sizes.find({ order: { sortOrder: 'ASC', widthMm: 'ASC', heightMm: 'ASC' } }),
    ]);
    const sizesBy = new Map<string, MachineTypeSizeView[]>();
    for (const s of sizes) {
      const list = sizesBy.get(s.machineTypeId) ?? [];
      list.push({
        id: s.id,
        widthMm: s.widthMm,
        heightMm: s.heightMm,
        label: s.label || `${s.widthMm} × ${s.heightMm} mm`,
      });
      sizesBy.set(s.machineTypeId, list);
    }
    const children = new Map<string | null, MachineType[]>();
    for (const t of types) {
      const key = t.parentId ?? null;
      const list = children.get(key) ?? [];
      list.push(t);
      children.set(key, list);
    }
    const out: MachineTypeView[] = [];
    const walk = (parentId: string | null, depth: number, trail: string[]) => {
      for (const t of children.get(parentId) ?? []) {
        const path = [...trail, t.name];
        out.push({
          id: t.id,
          name: t.name,
          parentId: t.parentId ?? null,
          labelId: t.labelId ?? null,
          path: path.join(' › '),
          depth,
          description: t.description,
          sortOrder: t.sortOrder,
          isActive: t.isActive,
          sizes: sizesBy.get(t.id) ?? [],
        });
        walk(t.id, depth + 1, path);
      }
    };
    walk(null, 0, []);
    return out;
  }

  private descendantIds(all: MachineTypeView[], id: string): string[] {
    const out = [id];
    for (let i = 0; i < out.length; i++) {
      for (const t of all) if (t.parentId === out[i] && !out.includes(t.id)) out.push(t.id);
    }
    return out;
  }

  private async find(id: string): Promise<MachineType> {
    const t = await this.types.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Makine türü bulunamadı.');
    return t;
  }

  private async assertParent(parentId: string | null, selfId: string | undefined): Promise<void> {
    if (!parentId) return;
    await this.find(parentId);
    if (selfId) {
      const subtree = await this.descendantsOf(selfId);
      if (subtree.includes(parentId)) {
        throw new BadRequestException('Bir tür kendisinin ya da kendi alt türünün altına taşınamaz.');
      }
    }
  }

  private async assertLabel(labelId: string | null): Promise<void> {
    if (!labelId) return;
    if (!(await this.labels.findOne({ where: { id: labelId } }))) {
      throw new NotFoundException('Etiket bulunamadı.');
    }
  }

  private async assertNameFree(name: string, parentId: string | null, exceptId?: string): Promise<void> {
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT id FROM machine_types
        WHERE deleted_at IS NULL AND lower(name) = lower($1)
          AND parent_id IS NOT DISTINCT FROM $2::uuid`,
      [name, parentId],
    );
    if (rows.some((r) => r.id !== exceptId)) {
      throw new ConflictException('Bu üst türün altında aynı adda bir tür zaten var.');
    }
  }

  private async assertSizeFree(typeId: string, w: number, h: number, exceptId?: string): Promise<void> {
    const dup = await this.sizes.findOne({ where: { machineTypeId: typeId, widthMm: w, heightMm: h } });
    if (dup && dup.id !== exceptId) throw new ConflictException('Bu ebat bu türde zaten tanımlı.');
  }
}

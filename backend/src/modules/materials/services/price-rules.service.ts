import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { PriceUnit } from '../../../common/enums/price-unit.enum';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { roundMoney } from '../../../common/utils/area.util';
import { CurrencyService } from '../../currency/currency.service';
import { SuppliersService } from '../../suppliers/suppliers.service';
import { cleanName } from '../catalog-key.util';
import {
  CreatePriceRuleDto,
  PreviewPriceRuleDto,
  PriceRuleScopeDto,
  UpdatePriceRuleDto,
  UpsertPriceRuleEntryDto,
} from '../dto/price-rule.dto';
import { MaterialPlate } from '../entities/material-plate.entity';
import { PriceRule } from '../entities/price-rule.entity';
import { PriceRuleEntry } from '../entities/price-rule-entry.entity';
import {
  pickRule,
  plateFacts,
  PlateFacts,
  ruleLabel,
  ruleMatches,
  sameScope,
} from '../price-rule-match.util';
import { MaterialBrandsService } from './material-brands.service';
import { MaterialCategoriesService } from './material-categories.service';
import { MaterialColorsService } from './material-colors.service';
import { MaterialSizesService } from './material-sizes.service';
import { MaterialThicknessesService } from './material-thicknesses.service';

/** Çatının referans fiyatı (hangi malzemeci, seçildi mi, TRY karşılığı). */
export interface RuleReference {
  entryId: string;
  supplierId: string | null;
  supplierName: string | null;
  price: number;
  currency: string;
  /** Baz para birimindeki karşılığı (son kurla); kur yoksa null. */
  priceBase: number | null;
  /** Referans seçilmemiş, en ucuz fiyat kendiliğinden alındı. */
  autoPicked: boolean;
  priceUpdatedAt: Date;
}

/** Kaç stok kalemini kapsıyor (stokta olan, etkin kalemler). */
export interface RuleCoverage {
  /** Kapsama giren kalem sayısı. */
  matched: number;
  /** Bu çatının geçerli olduğu kalemler (daha özel çatı yok). */
  effective: number;
  /** Geçerli olduğu kalemlerden kendi (kalem) fiyatı olanlar — onlarda kalem fiyatı kullanılır. */
  ownPrice: number;
}

export interface PriceRuleView {
  id: string;
  label: string;
  categoryId: string;
  category: { id: string; name: string } | null;
  brandId: string | null;
  brand: { id: string; name: string } | null;
  thicknessId: string | null;
  thickness: { id: string; valueMm: number } | null;
  colorId: string | null;
  color: { id: string; name: string; code?: string | null } | null;
  sizeId: string | null;
  size: { id: string; widthMm: number; heightMm: number } | null;
  variant: string | null;
  unit: PriceUnit;
  markupPercent: number | null;
  referenceEntryId: string | null;
  note: string | null;
  isActive: boolean;
  updatedAt: Date;
  entries: {
    id: string;
    supplierId: string | null;
    supplierName: string | null;
    price: number;
    currency: string;
    priceBase: number | null;
    priceUpdatedAt: Date;
    note: string | null;
  }[];
  reference: RuleReference | null;
  coverage: RuleCoverage;
}

export interface PriceRulePreview {
  label: string;
  matched: number;
  /** Bu kapsamla kaydedilirse geçerli olacağı kalem sayısı. */
  effective: number;
  /** İlk birkaç kalem adı (kullanıcı neyi kapsadığını görsün). */
  samples: string[];
  /** Aynı kapsamda zaten bir çatı varsa. */
  duplicate: { id: string; label: string } | null;
}

/**
 * Fiyat çatıları.
 *
 * Kapsam (kategori + isteğe bağlı marka/kalınlık/renk/ebat/alt tür) ile
 * bir grup malzemeye tek referans fiyat verir. Malzemecilerin fiyatları
 * çatıda tutulur; biri referans seçilir, seçilmezse en ucuzu geçerlidir.
 * Aynı kapsamda ikinci çatı açılamaz.
 */
@Injectable()
export class PriceRulesService {
  constructor(
    @InjectRepository(PriceRule)
    private readonly rulesRepo: Repository<PriceRule>,
    @InjectRepository(PriceRuleEntry)
    private readonly entriesRepo: Repository<PriceRuleEntry>,
    @InjectRepository(MaterialPlate)
    private readonly platesRepo: Repository<MaterialPlate>,
    private readonly categories: MaterialCategoriesService,
    private readonly brands: MaterialBrandsService,
    private readonly colors: MaterialColorsService,
    private readonly sizes: MaterialSizesService,
    private readonly thicknesses: MaterialThicknessesService,
    private readonly suppliers: SuppliersService,
    private readonly currency: CurrencyService,
  ) {}

  /** Etkin çatılar, fiyatlarıyla (fiyat önerisinde kullanılır). */
  activeRules(): Promise<PriceRule[]> {
    return this.rulesRepo.find({
      where: { isActive: true },
      relations: { entries: { supplier: true } },
    });
  }

  /** Bir kaleme uyan geçerli çatı (en özel), yoksa null. */
  ruleFor(rules: PriceRule[], plate: MaterialPlate): PriceRule | null {
    const facts = plateFacts(plate);
    return facts ? pickRule(rules, facts) : null;
  }

  /**
   * Çatının referans fiyatı: seçilen malzemeci fiyatı, seçilmemişse (ya da
   * silinmişse) TRY karşılığı en ucuz olan. Kuru olmayan döviz fiyatı en
   * ucuz seçiminde atlanır.
   */
  async referenceOf(rule: PriceRule): Promise<RuleReference | null> {
    const entries = rule.entries ?? [];
    if (!entries.length) return null;
    const chosen = rule.referenceEntryId
      ? entries.find((e) => e.id === rule.referenceEntryId)
      : undefined;
    if (chosen) {
      return this.toReference(chosen, false, await this.toBase(chosen));
    }
    let best: { entry: PriceRuleEntry; base: number } | null = null;
    for (const e of entries) {
      const base = await this.toBase(e);
      if (base == null) continue;
      if (!best || base < best.base) best = { entry: e, base };
    }
    if (best) return this.toReference(best.entry, true, best.base);
    // Hiçbiri çevrilemiyor (kur yok): ilkini göster, TRY karşılığı yok.
    return this.toReference(entries[0], true, null);
  }

  async list(categoryId?: string): Promise<PriceRuleView[]> {
    const rules = await this.rulesRepo.find({
      where: categoryId ? { categoryId } : {},
      relations: { entries: { supplier: true } },
      order: { createdAt: 'ASC' },
    });
    const coverage = await this.coverage(rules);
    const views: PriceRuleView[] = [];
    for (const r of rules) {
      views.push(await this.view(r, coverage.get(r.id)));
    }
    return views.sort(
      (a, b) =>
        (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'tr') ||
        a.label.localeCompare(b.label, 'tr', { numeric: true }),
    );
  }

  async findOne(id: string): Promise<PriceRule> {
    const rule = await this.rulesRepo.findOne({
      where: { id },
      relations: { entries: { supplier: true } },
    });
    if (!rule) throw new NotFoundException('Fiyat çatısı bulunamadı.');
    return rule;
  }

  async get(id: string): Promise<PriceRuleView> {
    const rule = await this.findOne(id);
    const all = await this.activeRules();
    const coverage = await this.coverage(
      all.some((r) => r.id === id) ? all : [...all, rule],
    );
    return this.view(rule, coverage.get(id));
  }

  /** Kapsam önizlemesi: kaç kalem, örnekler ve aynı kapsamda çatı var mı. */
  async preview(dto: PreviewPriceRuleDto): Promise<PriceRulePreview> {
    const draft = await this.draftRule(dto);
    const rules = (await this.activeRules()).filter((r) => r.id !== dto.excludeId);
    const plates = await this.stockPlates();
    let matched = 0;
    let effective = 0;
    const samples: string[] = [];
    for (const p of plates) {
      const facts = plateFacts(p);
      if (!facts || !ruleMatches(draft, facts)) continue;
      matched++;
      if (samples.length < 5 && !samples.includes(p.name)) samples.push(p.name);
      if (pickRule([...rules, draft], facts) === draft) effective++;
    }
    const all = await this.rulesRepo.find({ where: { categoryId: dto.categoryId } });
    const dup = all.find((r) => r.id !== dto.excludeId && sameScope(r, draft));
    return {
      label: ruleLabel(draft),
      matched,
      effective,
      samples,
      duplicate: dup ? { id: dup.id, label: ruleLabel(dup) } : null,
    };
  }

  async create(dto: CreatePriceRuleDto): Promise<PriceRuleView> {
    const draft = await this.draftRule(dto);
    await this.assertUnique(draft);
    const category = draft.category;
    const saved = await this.rulesRepo.save(
      this.rulesRepo.create({
        categoryId: draft.categoryId,
        brandId: draft.brandId,
        thicknessId: draft.thicknessId,
        colorId: draft.colorId,
        sizeId: draft.sizeId,
        variant: draft.variant,
        unit: dto.unit ?? this.defaultUnit(category?.defaultMeasurementType, !!draft.sizeId),
        markupPercent: dto.markupPercent ?? null,
        note: dto.note?.trim() || null,
        isActive: true,
      }),
    );
    return this.get(saved.id);
  }

  async update(id: string, dto: UpdatePriceRuleDto): Promise<PriceRuleView> {
    const rule = await this.findOne(id);
    const scopeChanged = (
      ['categoryId', 'brandId', 'thicknessId', 'colorId', 'sizeId', 'variant'] as const
    ).some((k) => dto[k] !== undefined);
    const patch: Partial<PriceRule> = {};
    if (scopeChanged) {
      const draft = await this.draftRule({
        categoryId: dto.categoryId ?? rule.categoryId,
        brandId: dto.brandId !== undefined ? dto.brandId : rule.brandId,
        thicknessId: dto.thicknessId !== undefined ? dto.thicknessId : rule.thicknessId,
        colorId: dto.colorId !== undefined ? dto.colorId : rule.colorId,
        sizeId: dto.sizeId !== undefined ? dto.sizeId : rule.sizeId,
        variant: dto.variant !== undefined ? dto.variant : rule.variant,
      });
      await this.assertUnique(draft, id);
      Object.assign(patch, {
        categoryId: draft.categoryId,
        brandId: draft.brandId,
        thicknessId: draft.thicknessId,
        colorId: draft.colorId,
        sizeId: draft.sizeId,
        variant: draft.variant,
      });
    }
    if (dto.unit !== undefined) patch.unit = dto.unit;
    if (dto.markupPercent !== undefined) patch.markupPercent = dto.markupPercent;
    if (dto.note !== undefined) patch.note = dto.note?.trim() || null;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    // Eager ilişki nesneleri FK değişikliğini ezmesin diye sütunlar doğrudan
    // güncellenir (MaterialTemplatesService.update ile aynı neden).
    if (Object.keys(patch).length) await this.rulesRepo.update(id, patch);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const rule = await this.findOne(id);
    if (rule.entries?.length) await this.entriesRepo.softRemove(rule.entries);
    await this.rulesRepo.softRemove(rule);
  }

  /**
   * Malzemecinin fiyatını ekler ya da günceller: çatı başına her malzemeci
   * (ve işletmenin liste fiyatı) için tek satır tutulur.
   */
  async upsertEntry(ruleId: string, dto: UpsertPriceRuleEntryDto): Promise<PriceRuleView> {
    const rule = await this.findOne(ruleId);
    const supplierId = dto.supplierId || null;
    if (supplierId) await this.suppliers.findOne(supplierId);
    const currency = (dto.currency ?? this.currency.baseCurrency).toUpperCase();
    let entry = (rule.entries ?? []).find((e) => (e.supplierId ?? null) === supplierId);
    if (entry) {
      await this.entriesRepo.update(entry.id, {
        price: dto.price,
        currency,
        note: dto.note !== undefined ? dto.note?.trim() || null : entry.note,
        priceUpdatedAt: new Date(),
      });
    } else {
      entry = await this.entriesRepo.save(
        this.entriesRepo.create({
          ruleId,
          supplierId,
          price: dto.price,
          currency,
          note: dto.note?.trim() || null,
          priceUpdatedAt: new Date(),
        }),
      );
    }
    if (dto.makeReference) {
      await this.rulesRepo.update(ruleId, { referenceEntryId: entry.id });
    }
    return this.get(ruleId);
  }

  async removeEntry(ruleId: string, entryId: string): Promise<PriceRuleView> {
    const rule = await this.findOne(ruleId);
    const entry = (rule.entries ?? []).find((e) => e.id === entryId);
    if (!entry) throw new NotFoundException('Fiyat bulunamadı.');
    await this.entriesRepo.softRemove(entry);
    if (rule.referenceEntryId === entryId) {
      await this.rulesRepo.update(ruleId, { referenceEntryId: null });
    }
    return this.get(ruleId);
  }

  /** Referans malzemeciyi seçer; null en ucuza döndürür. */
  async setReference(ruleId: string, entryId: string | null): Promise<PriceRuleView> {
    const rule = await this.findOne(ruleId);
    if (entryId && !(rule.entries ?? []).some((e) => e.id === entryId)) {
      throw new BadRequestException('Seçilen fiyat bu çatıya ait değil.');
    }
    await this.rulesRepo.update(ruleId, { referenceEntryId: entryId });
    return this.get(ruleId);
  }

  // ── Yardımcılar ─────────────────────────────────────────────────────

  /**
   * Kapsamı doğrular ve katalog kayıtlarını yükler (etiket ve eşleşme için).
   * Marka/kalınlık/renk/ebat çatının kategorisine ait olmalı.
   */
  private async draftRule(dto: PriceRuleScopeDto): Promise<PriceRule> {
    const category = await this.categories.findOne(dto.categoryId);
    const check = async <T extends { categoryId: string }>(
      id: string | null | undefined,
      fetch: (id: string) => Promise<T>,
      label: string,
    ): Promise<T | null> => {
      if (!id) return null;
      const row = await fetch(id);
      if (row.categoryId !== dto.categoryId) {
        throw new BadRequestException(`Seçilen ${label} bu malzeme türüne ait değil.`);
      }
      return row;
    };
    const [brand, thickness, color, size] = await Promise.all([
      check(dto.brandId, (id) => this.brands.findOne(id), 'marka'),
      check(dto.thicknessId, (id) => this.thicknesses.findOne(id), 'kalınlık'),
      check(dto.colorId, (id) => this.colors.findOne(id), 'renk'),
      check(dto.sizeId, (id) => this.sizes.findOne(id), 'ebat'),
    ]);
    const variant = dto.variant?.trim() ? cleanName(dto.variant) : null;
    return this.rulesRepo.create({
      categoryId: category.id,
      category,
      brandId: brand?.id ?? null,
      brand,
      thicknessId: thickness?.id ?? null,
      thickness,
      colorId: color?.id ?? null,
      color,
      sizeId: size?.id ?? null,
      size,
      variant,
      entries: [],
    });
  }

  private async assertUnique(draft: PriceRule, exceptId?: string): Promise<void> {
    const rows = await this.rulesRepo.find({ where: { categoryId: draft.categoryId } });
    const dup = rows.find((r) => r.id !== exceptId && sameScope(r, draft));
    if (dup) {
      throw new ConflictException(
        `Bu kapsamda bir fiyat çatısı zaten var: ${ruleLabel(dup)}. Fiyatı onun içine ekleyin.`,
      );
    }
  }

  /** Tabaka malzemede ebat seçildiyse tabaka başına, değilse m² başına. */
  private defaultUnit(type: MeasurementType | undefined, hasSize: boolean): PriceUnit {
    switch (type) {
      case MeasurementType.LENGTH:
        return PriceUnit.PER_METER;
      case MeasurementType.WEIGHT:
        return PriceUnit.PER_KG;
      case MeasurementType.PIECE:
        return PriceUnit.PER_PLATE;
      default:
        return hasSize ? PriceUnit.PER_PLATE : PriceUnit.PER_M2;
    }
  }

  /** Stokta olan etkin kalemler (kapsam sayımı için). */
  private stockPlates(): Promise<MaterialPlate[]> {
    return this.platesRepo.find({
      where: { isActive: true, quantityInStock: MoreThan(0) },
      relations: { template: true },
    });
  }

  /** Her çatının kaç kalemi kapsadığı ve kaçında geçerli olduğu. */
  private async coverage(rules: PriceRule[]): Promise<Map<string, RuleCoverage>> {
    const map = new Map<string, RuleCoverage>();
    for (const r of rules) map.set(r.id, { matched: 0, effective: 0, ownPrice: 0 });
    if (!rules.length) return map;
    const active = rules.filter((r) => r.isActive);
    for (const p of await this.stockPlates()) {
      const facts: PlateFacts | null = plateFacts(p);
      if (!facts) continue;
      for (const r of rules) {
        if (ruleMatches(r, facts)) map.get(r.id)!.matched++;
      }
      const winner = pickRule(active, facts);
      if (winner) {
        const c = map.get(winner.id)!;
        c.effective++;
        if (p.retailPrice != null) c.ownPrice++;
      }
    }
    return map;
  }

  private async view(rule: PriceRule, coverage?: RuleCoverage): Promise<PriceRuleView> {
    const entries = [];
    for (const e of rule.entries ?? []) {
      entries.push({
        id: e.id,
        supplierId: e.supplierId ?? null,
        supplierName: e.supplier?.name ?? null,
        price: Number(e.price),
        currency: e.currency,
        priceBase: await this.toBase(e),
        priceUpdatedAt: e.priceUpdatedAt,
        note: e.note ?? null,
      });
    }
    entries.sort(
      (a, b) =>
        (a.priceBase ?? Number.POSITIVE_INFINITY) - (b.priceBase ?? Number.POSITIVE_INFINITY),
    );
    return {
      id: rule.id,
      label: ruleLabel(rule),
      categoryId: rule.categoryId,
      category: rule.category ? { id: rule.category.id, name: rule.category.name } : null,
      brandId: rule.brandId ?? null,
      brand: rule.brand ? { id: rule.brand.id, name: rule.brand.name } : null,
      thicknessId: rule.thicknessId ?? null,
      thickness: rule.thickness
        ? { id: rule.thickness.id, valueMm: Number(rule.thickness.valueMm) }
        : null,
      colorId: rule.colorId ?? null,
      color: rule.color
        ? { id: rule.color.id, name: rule.color.name, code: rule.color.code ?? null }
        : null,
      sizeId: rule.sizeId ?? null,
      size: rule.size
        ? {
            id: rule.size.id,
            widthMm: Number(rule.size.widthMm),
            heightMm: Number(rule.size.heightMm),
          }
        : null,
      variant: rule.variant ?? null,
      unit: rule.unit,
      markupPercent: rule.markupPercent != null ? Number(rule.markupPercent) : null,
      referenceEntryId: rule.referenceEntryId ?? null,
      note: rule.note ?? null,
      isActive: rule.isActive,
      updatedAt: rule.updatedAt,
      entries,
      reference: await this.referenceOf(rule),
      coverage: coverage ?? { matched: 0, effective: 0, ownPrice: 0 },
    };
  }

  private toReference(
    e: PriceRuleEntry,
    autoPicked: boolean,
    priceBase: number | null,
  ): RuleReference {
    return {
      entryId: e.id,
      supplierId: e.supplierId ?? null,
      supplierName: e.supplier?.name ?? null,
      price: Number(e.price),
      currency: e.currency,
      priceBase,
      autoPicked,
      priceUpdatedAt: e.priceUpdatedAt,
    };
  }

  /** Fiyatın baz para birimindeki karşılığı (son kur); kur yoksa null. */
  private async toBase(e: { price: number | string; currency: string }): Promise<number | null> {
    const amount = Number(e.price);
    const cur = (e.currency || this.currency.baseCurrency).toUpperCase();
    if (cur === this.currency.baseCurrency.toUpperCase()) return amount;
    try {
      return roundMoney(await this.currency.toBase(amount, cur));
    } catch {
      return null;
    }
  }
}

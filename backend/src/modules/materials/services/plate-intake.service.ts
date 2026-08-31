import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { normalizeName } from '../catalog-key.util';
import {
  BatchCreatePlatesDto,
  BatchCreateResult,
  BatchPlateItemDto,
} from '../dto/batch-create-plates.dto';
import { MaterialTemplate } from '../entities/material-template.entity';
import { MaterialBrandsService } from './material-brands.service';
import { MaterialCategoriesService } from './material-categories.service';
import { MaterialColorsService } from './material-colors.service';
import { MaterialSizesService } from './material-sizes.service';
import { MaterialThicknessesService } from './material-thicknesses.service';
import { PlatesService } from './plates.service';

/** İşlem boyunca kendiliğinden açılan katalog kayıtlarının kaydı. */
type AutoLog = BatchCreateResult['autoCreated'];

/**
 * Stok girişi (tekli ve toplu).
 *
 * İki işi vardır:
 *  1) Katalog kayıtlarını ADLA çözer — tür/marka/renk/ebat/kalınlık yoksa
 *     kendiliğinden açılır, gerekiyorsa şablon da. Böylece her malzeme, her
 *     marka, her renk için önceden tek tek tanım yapmak gerekmez.
 *  2) Tek istekte birden çok kalem kaydeder ve hangi katalog kayıtlarının
 *     yeni açıldığını raporlar (arayüz kullanıcıya bunu söyler).
 *
 * Var olan kayıt asla kopyalanmaz: eşleştirme normalize edilmiş ad üzerinden
 * yapılır ("Dekota" = "dekota" = " DEKOTA ").
 */
@Injectable()
export class PlateIntakeService {
  private readonly logger = new Logger(PlateIntakeService.name);

  constructor(
    @InjectRepository(MaterialTemplate)
    private readonly templatesRepo: Repository<MaterialTemplate>,
    private readonly categories: MaterialCategoriesService,
    private readonly brands: MaterialBrandsService,
    private readonly colors: MaterialColorsService,
    private readonly sizes: MaterialSizesService,
    private readonly thicknesses: MaterialThicknessesService,
    private readonly plates: PlatesService,
  ) {}

  async createBatch(dto: BatchCreatePlatesDto): Promise<BatchCreateResult> {
    const autoCreated: AutoLog = {
      categories: [],
      brands: [],
      colors: [],
      sizes: [],
      thicknesses: [],
      templates: [],
    };
    const plateIds: string[] = [];

    for (const item of dto.items) {
      const templateId = await this.resolveTemplate(item, autoCreated);
      const copies = Math.max(1, Math.floor(item.copies ?? 1));
      for (let i = 0; i < copies; i++) {
        const plate = await this.plates.create({
          ...this.plateFields(item),
          templateId,
        });
        plateIds.push(plate.id);
      }
    }

    this.logger.log(
      `Toplu stok girişi: ${plateIds.length} kalem, ` +
        `${autoCreated.templates.length} yeni şablon.`,
    );
    return { created: plateIds.length, plateIds, autoCreated };
  }

  /** BatchPlateItemDto'dan yalnızca plaka alanlarını ayıklar (ad alanları hariç). */
  private plateFields(item: BatchPlateItemDto) {
    const {
      categoryName: _c,
      templateName: _t,
      brandName: _b,
      colorName: _cn,
      colorCode: _cc,
      thicknessMm: _th,
      sheetWidthMm: _sw,
      sheetHeightMm: _sh,
      copies: _cp,
      ...plate
    } = item;
    return plate;
  }

  /**
   * Kalemin şablonunu bulur ya da oluşturur. Şablon kimliği verilmişse
   * doğrudan kullanılır; verilmemişse tür + marka/renk/kalınlık/ebat
   * birleşiminden aranır, yoksa açılır.
   */
  private async resolveTemplate(
    item: BatchPlateItemDto,
    log: AutoLog,
  ): Promise<string> {
    if (item.templateId) return item.templateId;

    const categoryName = item.categoryName?.trim();
    if (!categoryName) {
      throw new BadRequestException(
        'Stok kalemi için ya şablon (templateId) ya da ürün türü adı (categoryName) gerekir.',
      );
    }

    const beforeCategories = (await this.categories.findAll()).length;
    const category = await this.categories.findOrCreateByName(
      categoryName,
      item.measurementType,
    );
    if ((await this.categories.findAll()).length > beforeCategories) {
      log.categories.push(category.name);
    }

    const brand = item.brandName?.trim()
      ? await this.track(
          log.brands,
          () => this.brands.findAll(category.id),
          () => this.brands.findOrCreateByName(category.id, item.brandName!),
          (b) => b.name,
        )
      : null;

    const color = item.colorName?.trim()
      ? await this.track(
          log.colors,
          () => this.colors.findAll(category.id),
          () =>
            this.colors.findOrCreateByName(
              category.id,
              item.colorName!,
              item.colorCode,
            ),
          (c) => c.name,
        )
      : null;

    const thickness =
      item.thicknessMm != null
        ? await this.track(
            log.thicknesses,
            () => this.thicknesses.findAll(category.id),
            () => this.thicknesses.findOrCreate(category.id, item.thicknessMm!),
            (t) => `${Number(t.valueMm)}mm`,
          )
        : null;

    const size =
      item.sheetWidthMm != null && item.sheetHeightMm != null
        ? await this.track(
            log.sizes,
            () => this.sizes.findAll(category.id),
            () =>
              this.sizes.findOrCreate(
                category.id,
                item.sheetWidthMm!,
                item.sheetHeightMm!,
              ),
            (s) => `${Number(s.widthMm)}×${Number(s.heightMm)}`,
          )
        : null;

    const name =
      item.templateName?.trim() ||
      [
        category.name,
        brand?.name,
        color?.name,
        thickness ? `${Number(thickness.valueMm)}mm` : '',
      ]
        .filter(Boolean)
        .join(' ');

    // Aynı tür + aynı varsayılanlar → aynı şablon (kopya açılmaz).
    const existing = (
      await this.templatesRepo.find({ where: { categoryId: category.id } })
    ).find(
      (t) =>
        (t.defaultBrandId ?? null) === (brand?.id ?? null) &&
        (t.defaultColorId ?? null) === (color?.id ?? null) &&
        (t.defaultThicknessId ?? null) === (thickness?.id ?? null) &&
        (t.defaultSizeId ?? null) === (size?.id ?? null) &&
        normalizeName(t.name) === normalizeName(name),
    );
    if (existing) return existing.id;

    const created = await this.templatesRepo.save(
      this.templatesRepo.create({
        name,
        categoryId: category.id,
        measurementType:
          item.measurementType ??
          category.defaultMeasurementType ??
          MeasurementType.AREA,
        defaultBrandId: brand?.id ?? null,
        defaultColorId: color?.id ?? null,
        defaultThicknessId: thickness?.id ?? null,
        defaultSizeId: size?.id ?? null,
      }),
    );
    log.templates.push(created.name);
    return created.id;
  }

  /**
   * Bir katalog kaydını bulur/oluşturur ve YENİ açıldıysa günlüğe yazar
   * (kullanıcıya "şu kayıtlar kendiliğinden açıldı" diyebilmek için).
   */
  private async track<T extends { id: string }>(
    log: string[],
    listAll: () => Promise<T[]>,
    resolve: () => Promise<T>,
    labelOf: (row: T) => string,
  ): Promise<T> {
    const before = new Set((await listAll()).map((r) => r.id));
    const row = await resolve();
    if (!before.has(row.id)) log.push(labelOf(row));
    return row;
  }
}

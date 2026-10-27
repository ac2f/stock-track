import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MeasurementType } from '../../common/enums/measurement-type.enum';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, IsNull, Repository } from 'typeorm';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../common/dto/paginated-result';
import { roundMoney } from '../../common/utils/area.util';
import { PlatesService } from '../materials/services/plates.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { QueryPurchaseDto } from './dto/query-purchase.dto';
import { ShopContext } from '../../common/shop/shop-context';

@Injectable()
export class PurchasesService {
  private readonly defaultWarehouseCode: string;

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly ordersRepo: Repository<PurchaseOrder>,
    private readonly platesService: PlatesService,
    private readonly warehousesService: WarehousesService,
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.defaultWarehouseCode =
      configService.get<string>('business.defaultWarehouseCode') ?? 'MERKEZ';
  }

  /**
   * Satın alma kaydı oluşturur. TEK transaction içinde:
   *  1) sipariş + kalemler yazılır,
   *  2) her kalem ilgili plakanın stoğunu artırır.
   * Personel (purchasedById) token'dan gelir → kim aldığı garanti kayıtlıdır.
   */
  async create(
    dto: CreatePurchaseDto,
    purchasedById: string,
  ): Promise<PurchaseOrder> {
    return this.dataSource.transaction(async (manager) => {
      const warehouse = dto.warehouseId
        ? await this.warehousesService.findOne(dto.warehouseId)
        : await this.warehousesService.resolveDefault(
            this.defaultWarehouseCode,
            manager,
          );

      // TABAKA (AREA) alışında bir kayıt = bir fiziksel tabaka: "4 adet" alınan
      // tabaka 4 ayrı stok kaydı olur (kesimler kaydın en/boyunu düşürdüğü için
      // tek kayıtta adet tutulamaz). Seçilen kalem yalnız ne alındığını (tür,
      // marka, renk, kalınlık, ebat) söyler; tabakalar tam ebatlı açılır, alışta
      // parça ölçüsü yazıldıysa o ölçüde. Alış kaleminin plakası ilk yeni tabakadır.
      const purchased: { plateId: string; sheets: boolean }[] = [];
      for (const it of dto.items) {
        const plate = await this.platesService.findOne(it.plateId);
        if (plate.measurementType !== MeasurementType.AREA) {
          purchased.push({ plateId: it.plateId, sheets: false });
          continue;
        }
        if (!Number.isInteger(it.quantity)) {
          throw new BadRequestException(
            `${plate.name}: tabaka alımında adet tam sayı olmalıdır (kesirli tabaka yok).`,
          );
        }
        const first = await this.platesService.create(
          {
            templateId: plate.templateId,
            brandId: plate.brandId ?? undefined,
            colorId: plate.colorId ?? undefined,
            sizeId: plate.sizeId ?? undefined,
            thicknessId: plate.thicknessId ?? undefined,
            variant: plate.variant ?? undefined,
            widthMm: it.widthMm,
            heightMm: it.heightMm,
            quantityInStock: it.quantity,
            warehouseId: warehouse.id,
            addedAt: dto.purchaseDate?.slice(0, 10),
          },
          manager,
        );
        purchased.push({ plateId: first.id, sheets: true });
      }

      const items: PurchaseOrderItem[] = dto.items.map((it, i) =>
        manager.create(PurchaseOrderItem, {
          plateId: purchased[i].plateId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: roundMoney(it.quantity * it.unitPrice),
          widthMm: it.widthMm ?? null,
          heightMm: it.heightMm ?? null,
        }),
      );

      const totalAmount = roundMoney(
        items.reduce((sum, it) => sum + Number(it.lineTotal), 0),
      );

      const order = manager.create(PurchaseOrder, {
        supplierId: dto.supplierId,
        vehicleId: dto.vehicleId,
        warehouseId: warehouse.id,
        purchasedById,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : ShopContext.now(),
        currency: dto.currency ?? 'TRY',
        note: dto.note,
        totalAmount,
        items,
      });

      const saved = await manager.save(order);

      // Stoğa giriş (tabaka dışı kalemler) — seçilen depoya, işletme stoğu
      // olarak, aynı transaction'da. Tabakalar yukarıda kayıtla birlikte girdi.
      for (let i = 0; i < dto.items.length; i++) {
        if (purchased[i].sheets) continue;
        await this.platesService.adjustStock(
          dto.items[i].plateId,
          warehouse.id,
          dto.items[i].quantity,
          null,
          manager,
        );
      }

      return saved;
    });
  }

  async findAll(
    query: QueryPurchaseDto,
  ): Promise<PaginatedResult<PurchaseOrder>> {
    // Silinmiş alımlar listelenmez; ama tükenip stoktan düşen (soft-delete)
    // malzemenin ve kaldırılan tedarikçinin adı geçmiş alımda görünmeye devam
    // eder (aşağıda withDeleted) — yoksa kalem "—" olarak kalırdı.
    const where: FindOptionsWhere<PurchaseOrder> = { deletedAt: IsNull() };
    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    if (query.from && query.to) {
      where.purchaseDate = Between(new Date(query.from), new Date(query.to));
    }

    const [items, total] = await this.ordersRepo.findAndCount({
      where,
      // Aynı tarihli alımlar sayfalar arasında kaymasın: ikincil sıra kimlik.
      order: { purchaseDate: 'DESC', id: 'DESC' },
      skip: query.skip,
      take: query.limit,
      // Liste tedarikçi adını ve kalemleri (plaka adı + ölçü birimi) gösterir;
      // kullanıcı/araç/depo ve plaka → şablon → katalog zinciri yüklenmez.
      relations: { supplier: true, items: { plate: true } },
      loadEagerRelations: false,
      withDeleted: true,
    });
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<PurchaseOrder> {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Satın alma kaydı bulunamadı.');
    }
    return order;
  }
}

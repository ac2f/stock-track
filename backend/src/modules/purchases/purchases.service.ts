import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, Repository } from 'typeorm';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../common/dto/paginated-result';
import { roundMoney } from '../../common/utils/area.util';
import { PlatesService } from '../materials/services/plates.service';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { QueryPurchaseDto } from './dto/query-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly ordersRepo: Repository<PurchaseOrder>,
    private readonly platesService: PlatesService,
    private readonly dataSource: DataSource,
  ) {}

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
      const items: PurchaseOrderItem[] = dto.items.map((it) =>
        manager.create(PurchaseOrderItem, {
          plateId: it.plateId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: roundMoney(it.quantity * it.unitPrice),
        }),
      );

      const totalAmount = roundMoney(
        items.reduce((sum, it) => sum + Number(it.lineTotal), 0),
      );

      const order = manager.create(PurchaseOrder, {
        supplierId: dto.supplierId,
        vehicleId: dto.vehicleId,
        purchasedById,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : new Date(),
        currency: dto.currency ?? 'TRY',
        note: dto.note,
        totalAmount,
        items,
      });

      const saved = await manager.save(order);

      // Stoğa giriş — aynı transaction'da, atomik.
      for (const it of dto.items) {
        await this.platesService.adjustStock(it.plateId, it.quantity, manager);
      }

      return saved;
    });
  }

  async findAll(
    query: QueryPurchaseDto,
  ): Promise<PaginatedResult<PurchaseOrder>> {
    const where: FindOptionsWhere<PurchaseOrder> = {};
    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    if (query.from && query.to) {
      where.purchaseDate = Between(new Date(query.from), new Date(query.to));
    }

    const [items, total] = await this.ordersRepo.findAndCount({
      where,
      order: { purchaseDate: 'DESC' },
      skip: query.skip,
      take: query.limit,
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

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentDirection } from '../../../common/enums/payment-direction.enum';
import { Customer } from '../../customers/entities/customer.entity';
import { NotificationType } from '../enums/notification.enums';
import { NotificationsService } from '../notifications.service';

export interface PaymentReceivedEvent {
  customerId: string;
  paymentId: string;
  amount: number;
  baseAmount: number;
  direction: PaymentDirection;
  balanceAfter: number;
}

export interface SaleCreatedEvent {
  saleId: string;
  buyerCustomerId: string;
  ownerCustomerId?: string;
  baseSaleTotal: number;
  baseOwnerAmount: number;
  businessMargin: number;
}

export interface StockLowEvent {
  plateId: string;
  plateName: string;
  warehouseId?: string;
  quantity: number;
  reorderLevel: number;
}

@Injectable()
export class NotificationListeners {
  constructor(
    private readonly notifications: NotificationsService,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
  ) {}

  @OnEvent('payment.received')
  async onPaymentReceived(e: PaymentReceivedEvent): Promise<void> {
    const customer = await this.customersRepo.findOne({
      where: { id: e.customerId },
    });
    const kind =
      e.direction === PaymentDirection.INCOMING
        ? 'Ödemeniz alındı'
        : 'Tarafınıza ödeme yapıldı';
    await this.notifications.notify({
      type: NotificationType.PAYMENT_RECEIVED,
      subject: kind,
      body:
        `${customer?.name ?? 'Müşteri'} — tutar: ${e.baseAmount}. ` +
        `Kalan bakiye: ${e.balanceAfter}.`,
      telegramChatId: customer?.telegramChatId,
      whatsappPhone: customer?.phone,
      relatedType: 'payment',
      relatedId: e.paymentId,
    });
  }

  @OnEvent('sale.created')
  async onSaleCreated(e: SaleCreatedEvent): Promise<void> {
    // Üçüncü kişi sahibine payını bildir.
    if (e.ownerCustomerId && e.baseOwnerAmount > 0) {
      const owner = await this.customersRepo.findOne({
        where: { id: e.ownerCustomerId },
      });
      await this.notifications.notify({
        type: NotificationType.SALE_CREATED,
        subject: 'Malzemeniz satıldı',
        body: `Satıştan payınız: ${e.baseOwnerAmount}.`,
        telegramChatId: owner?.telegramChatId,
        whatsappPhone: owner?.phone,
        relatedType: 'sale',
        relatedId: e.saleId,
      });
    } else {
      // Sahibi yoksa yalnızca işletme kaydı/log.
      await this.notifications.notify({
        type: NotificationType.SALE_CREATED,
        subject: 'Satış kaydedildi',
        body: `Satış tutarı: ${e.baseSaleTotal}, kâr: ${e.businessMargin}.`,
        relatedType: 'sale',
        relatedId: e.saleId,
      });
    }
  }

  @OnEvent('stock.low')
  async onStockLow(e: StockLowEvent): Promise<void> {
    // Hedef owner chat (varsayılan); recipient verilmezse TelegramChannel default'u kullanır.
    await this.notifications.notify({
      type: NotificationType.STOCK_LOW,
      subject: 'Kritik stok uyarısı',
      body: `${e.plateName} stoğu kritik seviyede: ${e.quantity} (eşik: ${e.reorderLevel}).`,
      relatedType: 'plate',
      relatedId: e.plateId,
    });
  }
}

import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import { LedgerEntryType } from '../../../common/enums/ledger-entry-type.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../common/dto/paginated-result';
import { Customer } from '../entities/customer.entity';
import { CustomerLedgerEntry } from '../entities/customer-ledger-entry.entity';
import { Sale } from '../../sales/entities/sale.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { ProcessingJob } from '../../processing/entities/processing-job.entity';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { QueryCustomerDto } from '../dto/query-customer.dto';
import { CreateLedgerEntryDto } from '../dto/create-ledger-entry.dto';
import { SettleDebtDto } from '../dto/apply-discount.dto';
import { CustomerAccountService } from './customer-account.service';
import { PaymentsService } from './payments.service';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    private readonly accountService: CustomerAccountService,
    private readonly paymentsService: PaymentsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Müşteri oluşturur. Açılış borcu verilmişse, deftere OPENING (DEBIT)
   * hareketi olarak işlenir → current_balance tutarlı başlar.
   */
  async create(dto: CreateCustomerDto): Promise<Customer> {
    return this.dataSource.transaction(async (manager) => {
      const customer = manager.create(Customer, {
        name: dto.name,
        companyName: dto.companyName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        taxNumber: dto.taxNumber,
        openingBalance: dto.openingBalance ?? 0,
        currentBalance: 0,
      });
      const saved = await manager.save(customer);

      if (dto.openingBalance && dto.openingBalance > 0) {
        await this.accountService.applyDebit(manager, {
          customerId: saved.id,
          amount: dto.openingBalance,
          sourceType: LedgerSourceType.OPENING,
          description: 'Açılış bakiyesi',
        });
      }
      return manager.findOneOrFail(Customer, { where: { id: saved.id } });
    });
  }

  /**
   * Gelişmiş filtreleme: serbest arama (ad/firma/telefon), borç durumu,
   * minimum borç ve sıralama (ad / bakiye / son hareket).
   */
  async findAll(query: QueryCustomerDto): Promise<PaginatedResult<Customer>> {
    const qb = this.customersRepo.createQueryBuilder('customer');

    if (query.search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('customer.name ILIKE :s', { s: `%${query.search}%` })
            .orWhere('customer.company_name ILIKE :s', {
              s: `%${query.search}%`,
            })
            .orWhere('customer.phone ILIKE :s', { s: `%${query.search}%` });
        }),
      );
    }
    if (query.hasDebt) {
      qb.andWhere('customer.current_balance > 0');
    }
    if (query.minDebt != null) {
      qb.andWhere('customer.current_balance >= :minDebt', {
        minDebt: query.minDebt,
      });
    }
    if (query.from) {
      qb.andWhere('customer.created_at >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('customer.created_at <= :to', { to: query.to });
    }

    switch (query.sort) {
      case 'balance':
        qb.orderBy('customer.current_balance', 'DESC');
        break;
      case 'recent':
        qb.orderBy('customer.updated_at', 'DESC');
        break;
      default:
        qb.orderBy('customer.name', 'ASC');
    }

    qb.skip(query.skip).take(query.limit);
    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customersRepo.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Müşteri bulunamadı.');
    }
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.findOne(id);
    Object.assign(customer, dto);
    return this.customersRepo.save(customer);
  }

  /**
   * #3 Müşteriyi TAMAMEN siler (kalıcı). Soft-delete değil — silinen müşterinin
   * borçları raporlarda/alınacak ödemelerde hiç görünmez. Tek transaction içinde:
   *  - müşterinin ALICI olduğu satışları kaldırır (RESTRICT FK'yi açar); bu
   *    satışların sahip (owner) payı başka carilere CREDIT yazmış olabileceği için
   *    o defter hareketlerini de kaldırıp ilgili carileri yeniden hesaplar,
   *  - müşterinin ALICI olduğu teklifleri kaldırır (kalemler CASCADE),
   *  - müşteriyi fiziksel siler → kendi defter hareketleri + ödemeleri CASCADE;
   *    sahip olduğu malzeme satış/teklifleri ve işleme işleri SET NULL ile boşalır.
   */
  async remove(id: string): Promise<void> {
    await this.findOne(id); // yoksa 404
    await this.dataSource.transaction(async (manager) => {
      const buyerSales = await manager.find(Sale, {
        where: { buyerCustomerId: id },
        withDeleted: true,
      });
      const affectedOwners = new Set<string>();
      for (const sale of buyerSales) {
        const entries = await manager.find(CustomerLedgerEntry, {
          where: { sourceType: LedgerSourceType.SALE, sourceId: sale.id },
        });
        for (const e of entries) {
          if (e.customerId !== id) affectedOwners.add(e.customerId);
        }
        await manager.delete(CustomerLedgerEntry, {
          sourceType: LedgerSourceType.SALE,
          sourceId: sale.id,
        });
        await manager.delete(Sale, { id: sale.id });
      }

      await manager.delete(Quote, { buyerCustomerId: id });

      // Müşteriye ait işleme işlerini de sil — aksi halde customer_id SET NULL
      // olup kuyrukta/geçmişte "Müşterisiz" öksüz iş olarak kalıyordu. (Bunların
      // cari hareketleri zaten müşteriyle birlikte CASCADE silinir.)
      await manager.delete(ProcessingJob, { customerId: id });

      await manager.delete(Customer, { id });

      for (const ownerId of affectedOwners) {
        if (ownerId !== id) {
          await this.accountService.recomputeBalances(manager, ownerId);
        }
      }
    });
  }

  /** Cari defter dökümü. */
  async getLedger(id: string) {
    await this.findOne(id);
    return this.accountService.listLedger(id);
  }

  /**
   * Cariye elle (geçmiş tarihli olabilir) borç/alacak hareketi ekler (#8b).
   * Toplam bakiye her zaman doğru güncellenir; ekstre, occurredAt'e göre
   * kronolojik gösterilip yürüyen bakiye yeniden hesaplanır.
   */
  async addLedgerEntry(id: string, dto: CreateLedgerEntryDto): Promise<Customer> {
    await this.findOne(id);
    return this.dataSource.transaction(async (manager) => {
      const movement = {
        customerId: id,
        amount: dto.amount,
        sourceType: LedgerSourceType.MANUAL_ADJUSTMENT,
        description: dto.description ?? 'Manuel hareket',
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      };
      if (dto.entryType === LedgerEntryType.DEBIT) {
        await this.accountService.applyDebit(manager, movement);
      } else {
        await this.accountService.applyCredit(manager, movement);
      }
      return manager.findOneOrFail(Customer, { where: { id } });
    });
  }

  /**
   * Cariye indirim (borç kapatma/yuvarlama) işler — CREDIT, kaynak DISCOUNT.
   * Ekstrede "İndirim" olarak ayrı görünür; son ödemeden sonraki sorgularda da yer alır.
   */
  async applyDiscount(
    id: string,
    dto: { amount: number; description?: string; occurredAt?: string },
  ): Promise<Customer> {
    await this.findOne(id);
    return this.dataSource.transaction(async (manager) => {
      await this.accountService.applyCredit(manager, {
        customerId: id,
        amount: dto.amount,
        sourceType: LedgerSourceType.DISCOUNT,
        description: dto.description?.trim() || 'İndirim (borç kapatma)',
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      });
      return manager.findOneOrFail(Customer, { where: { id } });
    });
  }

  /**
   * #5 Borcu kapatma. Tahsil edilen tutar (varsa) GERÇEK bir ödeme kaydı olarak
   * (ödeme geçmişinde görünür) ve kalan fark İNDİRİM olarak işlenir; borç kapanır.
   *  - paidAmount = 0 → hiç para alınmadan borç kapatma: tamamı indirim (ödeme yok).
   *  - paidAmount > 0 → yöntem (nakit/havale/kart) zorunlu; gerçek ödeme oluşturulur,
   *    kalan fark aynı işlemde indirim yazılır (PaymentsService içinde).
   * İkisi de ekstrede ayrı satır olarak görünür.
   */
  async settleDebt(id: string, dto: SettleDebtDto): Promise<Customer> {
    const customer = await this.findOne(id);
    const balance = Number(customer.currentBalance);
    if (balance <= 0) {
      throw new BadRequestException('Bu carinin kapatılacak borcu yok.');
    }
    const paid = Math.min(Math.max(0, dto.paidAmount), balance);

    if (paid > 0) {
      if (!dto.method) {
        throw new BadRequestException(
          'Tahsilat girildiğinde ödeme yöntemi (nakit/havale/kart) zorunludur.',
        );
      }
      // Gerçek ödeme + kalan farkın indirimi tek transaction'da (closeDebt=true).
      await this.paymentsService.create(id, {
        amount: paid,
        method: dto.method,
        receivedById: dto.receivedById,
        bankAccountId: dto.bankAccountId,
        cardBusinessName: dto.cardBusinessName,
        paymentDate: dto.paymentDate,
        note: dto.note,
        closeDebt: true,
      });
      return this.findOne(id);
    }

    // Hiç para almadan borç kapatma: güncel borcun tamamı indirim.
    return this.dataSource.transaction(async (manager) => {
      await this.accountService.applyCredit(manager, {
        customerId: id,
        amount: balance,
        sourceType: LedgerSourceType.DISCOUNT,
        description: dto.note?.trim() || 'İndirim (borç kapatma — para alınmadan)',
        occurredAt: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
      });
      return manager.findOneOrFail(Customer, { where: { id } });
    });
  }

  /** Müşteri portalı için yeni bir salt-okunur erişim token'ı üretir (varsa yeniler). */
  async issuePortalToken(id: string): Promise<string> {
    const customer = await this.findOne(id);
    customer.portalToken = randomBytes(24).toString('hex');
    await this.customersRepo.save(customer);
    return customer.portalToken;
  }

  /** Portal erişimini iptal eder. */
  async revokePortalToken(id: string): Promise<void> {
    const customer = await this.findOne(id);
    customer.portalToken = null;
    await this.customersRepo.save(customer);
  }

  /** Portal token'ı ile müşteriyi bulur (public portal uçları için). */
  findByPortalToken(token: string): Promise<Customer | null> {
    return this.customersRepo.findOne({ where: { portalToken: token } });
  }
}

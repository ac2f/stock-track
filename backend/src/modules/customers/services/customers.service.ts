import { randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { LedgerSourceType } from '../../../common/enums/ledger-source-type.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../common/dto/paginated-result';
import { Customer } from '../entities/customer.entity';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { QueryCustomerDto } from '../dto/query-customer.dto';
import { CustomerAccountService } from './customer-account.service';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    private readonly accountService: CustomerAccountService,
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

  async remove(id: string): Promise<void> {
    const customer = await this.findOne(id);
    await this.customersRepo.softRemove(customer);
  }

  /** Cari defter dökümü. */
  async getLedger(id: string) {
    await this.findOne(id);
    return this.accountService.listLedger(id);
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountsRepo: Repository<BankAccount>,
  ) {}

  create(dto: CreateBankAccountDto): Promise<BankAccount> {
    return this.bankAccountsRepo.save(this.bankAccountsRepo.create(dto));
  }

  findAll(): Promise<BankAccount[]> {
    return this.bankAccountsRepo.find({ order: { bankName: 'ASC' } });
  }

  async findOne(id: string): Promise<BankAccount> {
    const account = await this.bankAccountsRepo.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('Banka hesabı bulunamadı.');
    }
    return account;
  }

  async update(id: string, dto: UpdateBankAccountDto): Promise<BankAccount> {
    const account = await this.findOne(id);
    Object.assign(account, dto);
    return this.bankAccountsRepo.save(account);
  }

  async remove(id: string): Promise<void> {
    const account = await this.findOne(id);
    await this.bankAccountsRepo.softRemove(account);
  }
}

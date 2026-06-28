import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../common/dto/paginated-result';
import { ExpenseCategory } from './entities/expense-category.entity';
import { Project } from './entities/project.entity';
import { Expense } from './entities/expense.entity';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  CreateProjectDto,
  QueryExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
  UpdateProjectDto,
} from './dto/expense.dto';

export interface ExpenseSummary {
  total: number;
  byCategory: { name: string; total: number }[];
  byProject: { name: string; total: number }[];
}

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(ExpenseCategory)
    private readonly categoriesRepo: Repository<ExpenseCategory>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
  ) {}

  // ── Gider türleri ──────────────────────────────────────────────────
  listCategories(): Promise<ExpenseCategory[]> {
    return this.categoriesRepo.find({ order: { name: 'ASC' } });
  }
  createCategory(dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    return this.categoriesRepo.save(this.categoriesRepo.create(dto));
  }
  async updateCategory(
    id: string,
    dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategory> {
    const cat = await this.categoriesRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Gider türü bulunamadı.');
    Object.assign(cat, dto);
    return this.categoriesRepo.save(cat);
  }
  async removeCategory(id: string): Promise<void> {
    const cat = await this.categoriesRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Gider türü bulunamadı.');
    await this.categoriesRepo.softRemove(cat);
  }

  // ── İş / Proje ──────────────────────────────────────────────────────
  listProjects(): Promise<Project[]> {
    return this.projectsRepo.find({ order: { createdAt: 'DESC' } });
  }
  createProject(dto: CreateProjectDto): Promise<Project> {
    return this.projectsRepo.save(this.projectsRepo.create(dto));
  }
  async updateProject(id: string, dto: UpdateProjectDto): Promise<Project> {
    const p = await this.projectsRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('İş/Proje bulunamadı.');
    Object.assign(p, dto);
    return this.projectsRepo.save(p);
  }
  async removeProject(id: string): Promise<void> {
    const p = await this.projectsRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('İş/Proje bulunamadı.');
    await this.projectsRepo.softRemove(p);
  }

  // ── Giderler ────────────────────────────────────────────────────────
  async createExpense(dto: CreateExpenseDto): Promise<Expense> {
    const category = await this.categoriesRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category) throw new BadRequestException('Geçersiz gider türü.');
    if (dto.projectId) {
      const project = await this.projectsRepo.findOne({
        where: { id: dto.projectId },
      });
      if (!project) throw new BadRequestException('Geçersiz iş/proje.');
    }
    const expense = this.expensesRepo.create({
      categoryId: dto.categoryId,
      projectId: dto.projectId ?? null,
      amount: dto.amount,
      currency: (dto.currency ?? 'TRY').toUpperCase(),
      expenseDate: dto.expenseDate ?? new Date().toISOString().slice(0, 10),
      description: dto.description,
    });
    return this.expensesRepo.save(expense);
  }

  async updateExpense(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    const expense = await this.expensesRepo.findOne({ where: { id } });
    if (!expense) throw new NotFoundException('Gider bulunamadı.');
    Object.assign(expense, {
      ...dto,
      projectId: dto.projectId === undefined ? expense.projectId : dto.projectId,
    });
    return this.expensesRepo.save(expense);
  }

  async removeExpense(id: string): Promise<void> {
    const expense = await this.expensesRepo.findOne({ where: { id } });
    if (!expense) throw new NotFoundException('Gider bulunamadı.');
    await this.expensesRepo.softRemove(expense);
  }

  async findExpenses(
    query: QueryExpenseDto,
  ): Promise<PaginatedResult<Expense>> {
    const qb = this.applyFilters(query);
    qb.orderBy('e.expense_date', 'DESC')
      .addOrderBy('e.created_at', 'DESC')
      .skip(query.skip)
      .take(query.limit);
    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  /** Filtrelenen aralık için toplam + tür/iş bazlı kırılım. */
  async summary(query: QueryExpenseDto): Promise<ExpenseSummary> {
    const byCategory = await this.applyFilters(query)
      .leftJoin('e.category', 'c')
      .select('c.name', 'name')
      .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
      .groupBy('c.name')
      .orderBy('total', 'DESC')
      .getRawMany<{ name: string; total: string }>();
    const byProject = await this.applyFilters(query)
      .leftJoin('e.project', 'p')
      .andWhere('e.project_id IS NOT NULL')
      .select('p.name', 'name')
      .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
      .groupBy('p.name')
      .orderBy('total', 'DESC')
      .getRawMany<{ name: string; total: string }>();
    const total = byCategory.reduce((s, r) => s + Number(r.total), 0);
    return {
      total,
      byCategory: byCategory.map((r) => ({ name: r.name, total: Number(r.total) })),
      byProject: byProject.map((r) => ({ name: r.name, total: Number(r.total) })),
    };
  }

  /**
   * Bekleyen sürekli giderler: tutarı tanımlı, sürekli (isRecurring) gider
   * türlerinden, içinde bulunulan ay için henüz gider girilmemiş olanlar.
   * "İşletmenin bu ay ödemesi gereken ama henüz ödemediği" sabit giderler (#7).
   */
  async pendingRecurring(asOf: Date = new Date()): Promise<
    { categoryId: string; name: string; amount: number; dueDate: string; overdue: boolean }[]
  > {
    const recurring = await this.categoriesRepo.find({
      where: { isRecurring: true, isActive: true },
    });
    const year = asOf.getFullYear();
    const month = asOf.getMonth(); // 0-index
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const next = new Date(year, month + 1, 1);
    const nextMonthStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;

    const pending: {
      categoryId: string;
      name: string;
      amount: number;
      dueDate: string;
      overdue: boolean;
    }[] = [];
    for (const c of recurring) {
      if (c.recurringAmount == null || Number(c.recurringAmount) <= 0) continue;
      // Bu ay bu tür için gider girilmiş mi?
      const paid = await this.expensesRepo
        .createQueryBuilder('e')
        .where('e.category_id = :id', { id: c.id })
        .andWhere('e.expense_date >= :s', { s: monthStart })
        .andWhere('e.expense_date < :n', { n: nextMonthStart })
        .getCount();
      if (paid > 0) continue;
      const day = Math.min(c.recurringDayOfMonth ?? 1, 28);
      const dueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      pending.push({
        categoryId: c.id,
        name: c.name,
        amount: Number(c.recurringAmount),
        dueDate,
        overdue: asOf.toISOString().slice(0, 10) > dueDate,
      });
    }
    return pending;
  }

  /** Bekleyen sürekli giderlerin toplamı (mali dashboard borcuna eklenir). */
  async pendingRecurringTotal(asOf: Date = new Date()): Promise<number> {
    const pending = await this.pendingRecurring(asOf);
    return pending.reduce((s, p) => s + p.amount, 0);
  }

  private applyFilters(query: QueryExpenseDto) {
    const qb = this.expensesRepo.createQueryBuilder('e');
    if (query.categoryId) {
      qb.andWhere('e.category_id = :categoryId', { categoryId: query.categoryId });
    }
    if (query.projectId) {
      qb.andWhere('e.project_id = :projectId', { projectId: query.projectId });
    }
    if (query.from) qb.andWhere('e.expense_date >= :from', { from: query.from });
    if (query.to) qb.andWhere('e.expense_date <= :to', { to: query.to });
    return qb;
  }
}

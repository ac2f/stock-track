import { api } from './client';
import type {
  Expense,
  ExpenseCategory,
  ExpenseSummary,
  Paginated,
  PendingExpense,
  Project,
} from '../types';

// ── Gider türleri ──
export interface ExpenseCategoryInput {
  name: string;
  isRecurring?: boolean;
  recurringAmount?: number;
  recurringDayOfMonth?: number;
  isActive?: boolean;
}

/** #7 Bu ay ödenmemiş sürekli (sabit) giderler. */
export async function fetchPendingExpenses(): Promise<PendingExpense[]> {
  const { data } = await api.get<PendingExpense[]>('/expenses/pending');
  return data;
}
export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data } = await api.get<ExpenseCategory[]>('/expense-categories');
  return data;
}
export async function createExpenseCategory(
  input: ExpenseCategoryInput,
): Promise<ExpenseCategory> {
  const { data } = await api.post<ExpenseCategory>('/expense-categories', input);
  return data;
}
export async function updateExpenseCategory(
  id: string,
  input: Partial<ExpenseCategoryInput>,
): Promise<ExpenseCategory> {
  const { data } = await api.patch<ExpenseCategory>(
    `/expense-categories/${id}`,
    input,
  );
  return data;
}
export async function deleteExpenseCategory(id: string): Promise<void> {
  await api.delete(`/expense-categories/${id}`);
}

// ── İş / Proje ──
export interface ProjectInput {
  name: string;
  description?: string;
  isActive?: boolean;
}
export async function fetchProjects(): Promise<Project[]> {
  const { data } = await api.get<Project[]>('/projects');
  return data;
}
export async function createProject(input: ProjectInput): Promise<Project> {
  const { data } = await api.post<Project>('/projects', input);
  return data;
}
export async function updateProject(
  id: string,
  input: Partial<ProjectInput>,
): Promise<Project> {
  const { data } = await api.patch<Project>(`/projects/${id}`, input);
  return data;
}
export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

// ── Giderler ──
export interface ExpenseFilters {
  categoryId?: string;
  projectId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
export interface ExpenseInput {
  categoryId: string;
  projectId?: string;
  amount: number;
  currency?: string;
  expenseDate?: string;
  description?: string;
}
export async function fetchExpenses(
  filters: ExpenseFilters,
): Promise<Paginated<Expense>> {
  const { data } = await api.get<Paginated<Expense>>('/expenses', {
    params: filters,
  });
  return data;
}
export async function fetchExpenseSummary(
  filters: ExpenseFilters,
): Promise<ExpenseSummary> {
  const { data } = await api.get<ExpenseSummary>('/expenses/summary', {
    params: filters,
  });
  return data;
}
export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const { data } = await api.post<Expense>('/expenses', input);
  return data;
}
export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/expenses/${id}`);
}

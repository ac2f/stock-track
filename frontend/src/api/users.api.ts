import { api } from './client';
import type { Employee, UserRole } from '../types';

export interface EmployeeInput {
  fullName: string;
  email: string;
  phone?: string;
  password?: string;
  role: UserRole;
  isActive?: boolean;
}

export async function fetchEmployees(): Promise<Employee[]> {
  const { data } = await api.get<Employee[]>('/users');
  return data;
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  const { data } = await api.post<Employee>('/users', input);
  return data;
}

export async function updateEmployee(
  id: string,
  input: Partial<EmployeeInput>,
): Promise<Employee> {
  const { data } = await api.patch<Employee>(`/users/${id}`, input);
  return data;
}

export async function deleteEmployee(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

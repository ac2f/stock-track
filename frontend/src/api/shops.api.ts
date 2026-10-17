import { api } from './client';
import type { ShopAccess, ShopPermissions } from '../types';

export interface ManagedShop {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
}

export interface ShopMemberView {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
  permissions: ShopPermissions;
  /** Üye olduğu başka dükkân sayısı. */
  otherShops: number;
  /** Oturumdaki kullanıcı bu üyeyi düzenleyebilir mi? */
  editable: boolean;
}

export interface StaffMember {
  id: string;
  fullName: string;
}

export interface CreateShopInput {
  name: string;
  copyFromShopId?: string;
  copyCatalog?: boolean;
  copySettings?: boolean;
}

export interface AddMemberInput {
  userId?: string;
  email?: string;
  newUser?: { fullName: string; email: string; password: string; phone?: string };
  isAdmin?: boolean;
  permissions: ShopPermissions;
}

export interface MemberAccountInput {
  fullName?: string;
  phone?: string;
  password?: string;
  isActive?: boolean;
}

export async function fetchMyShops(): Promise<ShopAccess[]> {
  const { data } = await api.get<ShopAccess[]>('/shops/mine');
  return data;
}

/** Ekip ekranı: sistem sahibine tüm dükkânlar, yöneticiye yönettikleri. */
export async function fetchManagedShops(): Promise<ManagedShop[]> {
  const { data } = await api.get<ManagedShop[]>('/shops');
  return data;
}

export async function createShop(input: CreateShopInput): Promise<ManagedShop> {
  const { data } = await api.post<ManagedShop>('/shops', input);
  return data;
}

export async function updateShop(
  id: string,
  input: { name?: string; isActive?: boolean },
): Promise<ManagedShop> {
  const { data } = await api.patch<ManagedShop>(`/shops/${id}`, input);
  return data;
}

export async function fetchMembers(shopId: string): Promise<ShopMemberView[]> {
  const { data } = await api.get<ShopMemberView[]>(`/shops/${shopId}/members`);
  return data;
}

export async function addMember(shopId: string, input: AddMemberInput): Promise<ShopMemberView> {
  const { data } = await api.post<ShopMemberView>(`/shops/${shopId}/members`, input);
  return data;
}

export async function updateMember(
  shopId: string,
  memberId: string,
  input: { isAdmin?: boolean; permissions?: ShopPermissions },
): Promise<ShopMemberView> {
  const { data } = await api.patch<ShopMemberView>(`/shops/${shopId}/members/${memberId}`, input);
  return data;
}

export async function updateMemberAccount(
  shopId: string,
  memberId: string,
  input: MemberAccountInput,
): Promise<ShopMemberView> {
  const { data } = await api.patch<ShopMemberView>(
    `/shops/${shopId}/members/${memberId}/account`,
    input,
  );
  return data;
}

export async function removeMember(shopId: string, memberId: string): Promise<void> {
  await api.delete(`/shops/${shopId}/members/${memberId}`);
}

/** Seçili dükkânın personeli (ödemeyi teslim alan vb. seçimler). */
export async function fetchStaff(): Promise<StaffMember[]> {
  const { data } = await api.get<StaffMember[]>('/shops/current/staff');
  return data;
}

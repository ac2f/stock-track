import { api, tokenStore } from './client';
import type { AuthUser } from '../types';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  const { data } = await api.post<LoginResponse>('/auth/login', {
    email,
    password,
  });
  tokenStore.set(data.accessToken, data.refreshToken);
  return data.user;
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}

export function logout(): void {
  tokenStore.clear();
}

import { useState } from 'react';

/**
 * Sayfa başına gösterilecek kayıt sayısı — sayfa/liste bazında localStorage'da
 * tutulur; sayfa yenilense bile seçim korunur. Backend limiti en fazla 100'dür.
 */
const PREFIX = 'st_pagesize_';
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function usePageSize(key: string, def = 20): readonly [number, (n: number) => void] {
  const storageKey = PREFIX + key;
  const [size, setSizeState] = useState<number>(() => {
    const v = Number(localStorage.getItem(storageKey));
    return v && v > 0 ? Math.min(v, 100) : def;
  });
  const setSize = (n: number) => {
    const clamped = Math.min(Math.max(1, n), 100);
    localStorage.setItem(storageKey, String(clamped));
    setSizeState(clamped);
  };
  return [size, setSize] as const;
}

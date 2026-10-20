import { useEffect, useState } from 'react';

/**
 * Değeri yazma bitince (varsayılan ~300 ms) günceller: arama kutularında her
 * harfte istek gitmesin diye.
 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

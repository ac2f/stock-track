import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readUrlState, writeUrlState, type UrlStateOptions } from '../lib/urlState';

/**
 * ``useState`` gibi, ama durum adres çubuğunda (bkz. lib/urlState.ts): yenileyince, geri gelince ya da bağlantı
 * paylaşılınca liste aynı aramayla, filtreyle, sayfada ve sekmede açılır.
 *
 *   const [filters, setFilters] = useUrlState<QuoteFilters>({ page: 1, limit: pageSize },
 *     { keys: ['search', 'status', 'from', 'to', 'page'] });
 *
 * Adres yerinde güncellenir (yazdıkça geçmiş şişmez); ``limit`` gibi ``keys``'te olmayanlar her zaman
 * varsayılandan gelir.
 */
export function useUrlState<T extends object>(defaults: T, opts: UrlStateOptions<T>): [T, Dispatch<SetStateAction<T>>] {
  const [params, setParams] = useSearchParams();
  const defKey = JSON.stringify(defaults);
  const optKey = JSON.stringify(opts);
  const search = params.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => readUrlState(new URLSearchParams(search), defaults, opts), [search, defKey, optKey]);
  const ref = useRef({ state, defaults, opts });
  ref.current = { state, defaults, opts };
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      setParams(
        (prev) => {
          const { defaults: d, opts: o } = ref.current;
          const cur = readUrlState(prev, d, o);
          const next = typeof action === 'function' ? (action as (p: T) => T)(cur) : action;
          return writeUrlState(prev, next, d, o);
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [state, set];
}

/** Tek bir değer adres çubuğunda (sekme, süzgeç, arama): ``useState`` gibi. */
export function useUrlField<V extends string | number | boolean>(
  key: string,
  initial: V,
  allowed?: readonly V[],
  prefix?: string,
): [V, Dispatch<SetStateAction<V>>] {
  const [raw, setState] = useUrlState<Record<string, V>>({ [key]: initial }, { keys: [key], prefix });
  // (izin verilenlerden olmayan bir değer — elle yazılmış ya da eski bir bağlantıdan — başlangıç değeri olur)
  const state = allowed && !allowed.includes(raw[key]) ? { ...raw, [key]: initial } : raw;
  const set = useCallback<Dispatch<SetStateAction<V>>>(
    (action) =>
      setState((s) => ({ ...s, [key]: typeof action === 'function' ? (action as (p: V) => V)(s[key]) : action })),
    [setState, key],
  );
  return [state[key], set];
}

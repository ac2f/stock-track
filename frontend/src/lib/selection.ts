import { useMemo, useState } from 'react';

/**
 * Listelerde toplu seçim. Seçilen KAYITLAR (yalnız kimlik değil) tutulur:
 * sayfa değişse ya da süzgeç kalıcı olarak listeden çıkarsa bile onay
 * ekranları seçilenleri adıyla gösterebilir.
 */
export type SelState = 'none' | 'some' | 'all';

type Rec = { id: string };

/** Hepsi seçiliyse hepsini kaldırır; değilse eksik olanları ekler. */
export function toggleManyIn<T extends Rec>(
  map: ReadonlyMap<string, T>,
  items: readonly T[],
): Map<string, T> {
  const next = new Map(map);
  if (items.length && items.every((i) => map.has(i.id))) {
    for (const i of items) next.delete(i.id);
  } else {
    for (const i of items) next.set(i.id, i);
  }
  return next;
}

export function stateOf<T extends Rec>(map: ReadonlyMap<string, T>, items: readonly T[]): SelState {
  if (!items.length) return 'none';
  const n = items.reduce((c, i) => c + (map.has(i.id) ? 1 : 0), 0);
  return n === 0 ? 'none' : n === items.length ? 'all' : 'some';
}

/** Yalnız `keep` kimliklerinden olanları bırakır; değişiklik yoksa aynı nesne döner. */
export function retainIn<T extends Rec>(
  map: ReadonlyMap<string, T>,
  keep: ReadonlySet<string>,
): ReadonlyMap<string, T> {
  let changed = false;
  const next = new Map<string, T>();
  for (const [id, v] of map) {
    if (keep.has(id)) next.set(id, v);
    else changed = true;
  }
  return changed ? next : map;
}

export function withoutIds<T extends Rec>(
  map: ReadonlyMap<string, T>,
  ids: Iterable<string>,
): ReadonlyMap<string, T> {
  const drop = new Set(ids);
  if (![...drop].some((id) => map.has(id))) return map;
  const next = new Map(map);
  for (const id of drop) next.delete(id);
  return next;
}

export interface Selection<T extends Rec> {
  size: number;
  list: T[];
  ids: string[];
  has: (id: string) => boolean;
  toggle: (item: T) => void;
  toggleMany: (items: readonly T[]) => void;
  addMany: (items: readonly T[]) => void;
  stateOf: (items: readonly T[]) => SelState;
  /** Yalnız bu kimlikler seçili kalır (listeden kalkan kayıtları düşürür). */
  retain: (ids: Iterable<string>) => void;
  remove: (ids: Iterable<string>) => void;
  clear: () => void;
}

export function useSelection<T extends Rec>(): Selection<T> {
  const [map, setMap] = useState<ReadonlyMap<string, T>>(() => new Map());
  return useMemo<Selection<T>>(
    () => ({
      size: map.size,
      list: [...map.values()],
      ids: [...map.keys()],
      has: (id) => map.has(id),
      toggle: (item) => setMap((m) => toggleManyIn(m, [item])),
      toggleMany: (items) => setMap((m) => toggleManyIn(m, items)),
      addMany: (items) =>
        setMap((m) => {
          const next = new Map(m);
          for (const i of items) next.set(i.id, i);
          return next;
        }),
      stateOf: (items) => stateOf(map, items),
      retain: (ids) => {
        const keep = new Set(ids);
        setMap((m) => retainIn(m, keep));
      },
      remove: (ids) => setMap((m) => withoutIds(m, ids)),
      clear: () => setMap((m) => (m.size ? new Map() : m)),
    }),
    [map],
  );
}

import { PAGE_SIZE_OPTIONS } from '../hooks/usePageSize';

/**
 * Sayfalama denetimi: önceki/sonraki + "Sayfa X / Y · N kayıt" + sayfa başına
 * kayıt seçici. Sayfa boyutu seçimi çağıran sayfada localStorage'da kalıcıdır.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const pages = Math.max(1, pageCount);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label className="flex items-center gap-2 text-xs text-slate-500">
        Sayfa başına
        <select
          className="input w-auto py-1"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          className="btn bg-slate-100 px-3 py-1 text-sm disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ← Önceki
        </button>
        <span className="text-xs text-slate-500">
          Sayfa {page} / {pages} · {total} kayıt
        </span>
        <button
          className="btn bg-slate-100 px-3 py-1 text-sm disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Sonraki →
        </button>
      </div>
    </div>
  );
}

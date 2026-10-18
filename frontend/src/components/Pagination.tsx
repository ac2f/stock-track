import { PAGE_SIZE_OPTIONS } from '../hooks/usePageSize';

/**
 * Sayfalama denetimi: önceki/sonraki + "21–40 / 57 kayıt" + sayfa başına
 * kayıt seçici. Sayfa boyutu seçimi çağıran sayfada localStorage'da kalıcıdır.
 * Tek sayfalık listede yalnız kayıt sayısı görünür.
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
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const go = (p: number) => {
    onPage(p);
    // Yeni sayfanın başı görünsün (kaydırma kabı main'dir).
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-slate-500">
        {total === 0 ? 'Kayıt yok' : pages > 1 ? `${first}–${last} / ${total} kayıt` : `${total} kayıt`}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="hidden sm:inline">Sayfa başına</span>
          <select
            className="input min-h-[36px] w-auto py-1 md:text-xs"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Sayfa başına kayıt"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {pages > 1 && (
          <>
            <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Önceki sayfa">
              ← <span className="hidden sm:inline">Önceki</span>
            </button>
            <span className="whitespace-nowrap text-xs text-slate-500">
              {page} / {pages}
            </span>
            <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Sonraki sayfa">
              <span className="hidden sm:inline">Sonraki</span> →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

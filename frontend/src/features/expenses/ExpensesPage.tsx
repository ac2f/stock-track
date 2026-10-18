import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  createExpense,
  createExpenseCategory,
  createProject,
  deleteExpense,
  deleteExpenseCategory,
  deleteProject,
  fetchExpenseCategories,
  fetchExpenseSummary,
  fetchExpenses,
  fetchPendingExpenses,
  fetchProjects,
  updateExpenseCategory,
  type ExpenseCategoryInput,
  type ExpenseFilters,
  type ExpenseInput,
} from '../../api/expenses.api';
import { openPdf } from '../../api/documents.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { Filters } from '../../components/ui/Filters';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { useUrlParam } from '../../hooks/useUrlParam';
import { formatDate, formatMoney } from '../../lib/format';


/** Filtrelerden sorgu dizesi üretir (boş alanlar atlanır). */
function queryString(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Zorunlu alan işareti. */
const Req = () => (
  <span className="text-red-600" aria-hidden>
    {' '}
    *
  </span>
);

/** Gider yönetimi: giderler + özet + gider türleri ve iş/proje katalogları. */
export function ExpensesPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<ExpenseFilters>({ page: 1, limit: 50 });
  const [form, setForm] = useState<ExpenseInput>({
    categoryId: '',
    amount: 0,
    expenseDate: todayISO(),
  });
  const [showCatalogs, setShowCatalogs] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: fetchExpenseCategories,
  });
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });
  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => fetchExpenses(filters),
  });
  const { data: summary } = useQuery({
    queryKey: ['expense-summary', filters],
    queryFn: () => fetchExpenseSummary(filters),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['expense-summary'] });
  };
  const createMut = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      invalidate();
      setForm({ categoryId: '', amount: 0, expenseDate: todayISO() });
    },
  });
  const deleteMut = useMutation({ mutationFn: deleteExpense, onSuccess: invalidate });

  const setFilter = (patch: Partial<ExpenseFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  // Etkin filtre sayısı (tarih aralığı tek filtre sayılır).
  const activeCount =
    (filters.from || filters.to ? 1 : 0) + (filters.categoryId ? 1 : 0) + (filters.projectId ? 1 : 0);
  const clearFilters = () => setFilters({ page: 1, limit: 50 });

  // "Yeni gider" formuna kaydır ve ilk alana odaklan. Üstteki kartlar (özet,
  // bekleyen giderler) veri gelince uzayıp formu aşağı ittiğinden kaydırma,
  // sorgular bitince yapılır; odak hemen verilir ki yazmaya başlanabilsin.
  const formRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const [focusReq, setFocusReq] = useState(0);
  const [flash, setFlash] = useState(false);
  const scrolledReq = useRef(0);
  const fetching = useIsFetching();
  const focusNewForm = () => {
    firstFieldRef.current?.focus({ preventScroll: true });
    setFocusReq((n) => n + 1);
  };
  useEffect(() => {
    if (!focusReq || fetching > 0 || scrolledReq.current === focusReq) return;
    scrolledReq.current = focusReq;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    formRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    firstFieldRef.current?.focus({ preventScroll: true });
    setFlash(true);
  }, [focusReq, fetching]);
  // Form kısa bir süre vurgulanır: kullanıcı nereye gelindiğini görür.
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), 1600);
    return () => window.clearTimeout(t);
  }, [flash]);
  // Hızlı aramadan /expenses?new=1 ile gelinirse formu aç.
  useUrlParam('new', focusNewForm);

  const csvHref = (() => {
    const rows = [
      ['Tarih', 'Tur', 'Is/Proje', 'Tutar', 'ParaBirimi', 'Aciklama'],
      ...(expenses?.items ?? []).map((e) => [
        e.expenseDate,
        e.category?.name ?? '',
        e.project?.name ?? '',
        String(e.amount),
        e.currency,
        e.description ?? '',
      ]),
    ];
    const csv =
      '﻿' +
      rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    return URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  })();

  const items = expenses?.items ?? [];
  const totalCount = expenses?.meta?.total ?? items.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Giderler"
        icon="💸"
        subtitle="Giderleri girin, türe ve işe göre izleyin; sürekli (sabit) giderleri tek dokunuşla ödendi yapın."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowCatalogs((s) => !s)}>
              {showCatalogs ? 'Katalogları gizle' : 'Tür / İş yönet'}
            </button>
            <button className="btn-primary" data-hotkey="n" title="Yeni gider (N)" onClick={focusNewForm}>
              + Yeni gider
            </button>
          </>
        }
      />

      {showCatalogs && <Catalogs />}

      <PendingRecurring />

      {/* Filtreler */}
      <Filters className="!mb-0" activeCount={activeCount} onClear={clearFilters}>
        <div className="grid gap-3 lg:grid-cols-2">
          <DateRangeFilter
            value={{ from: filters.from, to: filters.to }}
            onChange={(r) => setFilter({ from: r.from, to: r.to })}
          />
          <div className="grid grid-cols-1 content-start gap-2 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="label">Gider türü</span>
              <select
                className="input"
                value={filters.categoryId ?? ''}
                onChange={(e) => setFilter({ categoryId: e.target.value || undefined })}
              >
                <option value="">Tümü</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="label">İş / Proje</span>
              <select
                className="input"
                value={filters.projectId ?? ''}
                onChange={(e) => setFilter({ projectId: e.target.value || undefined })}
              >
                <option value="">Tümü</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </Filters>

      {/* Özet */}
      {summary && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Toplam gider{activeCount > 0 ? ' (filtreye göre)' : ''}
              </p>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(summary.total)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="btn-secondary btn-sm" href={csvHref} download="giderler.csv">
                ⬇ CSV (tablo)
              </a>
              <button
                className="btn-secondary btn-sm"
                onClick={() =>
                  openPdf(
                    `/expenses/report/print${queryString({
                      from: filters.from,
                      to: filters.to,
                      categoryId: filters.categoryId,
                      projectId: filters.projectId,
                    })}`,
                  )
                }
              >
                🖨 Yazdır / PDF
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Breakdown title="Türe göre" rows={summary.byCategory} total={summary.total} bar="bg-blue-500" />
            <Breakdown
              title="İş/projeye göre"
              rows={summary.byProject}
              total={summary.total}
              bar="bg-violet-500"
            />
          </div>
        </div>
      )}

      {/* Yeni gider */}
      <div
        ref={formRef}
        className={`card scroll-mt-4 space-y-3 transition-shadow ${flash ? 'ring-2 ring-blue-400' : ''}`}
      >
        <h2 className="font-semibold">Yeni gider</h2>
        {categories && categories.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            <span>Gider girmek için önce bir gider türü ekleyin (örn. Kira, Malzeme).</span>
            {!showCatalogs && (
              <button className="btn-secondary btn-sm" onClick={() => setShowCatalogs(true)}>
                Tür / İş yönet
              </button>
            )}
          </div>
        )}
        {createMut.error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {(createMut.error as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Gider kaydedilemedi.'}
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block min-w-0">
            <span className="label">
              Gider türü
              <Req />
            </span>
            <select
              ref={firstFieldRef}
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Seçin…</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isRecurring ? ' (sürekli)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="label">İş / Proje (varsa)</span>
            <select
              className="input"
              value={form.projectId ?? ''}
              onChange={(e) => setForm({ ...form, projectId: e.target.value || undefined })}
            >
              <option value="">— yok —</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0">
            <span className="label">
              Tutar (₺)
              <Req />
            </span>
            <input
              className="input text-right tabular-nums"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              placeholder="0,00"
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </label>
          <label className="block min-w-0">
            <span className="label">Tarih</span>
            <input
              className="input"
              type="date"
              value={form.expenseDate ?? ''}
              onChange={(e) => setForm({ ...form, expenseDate: e.target.value || undefined })}
            />
          </label>
        </div>
        <label className="block">
          <span className="label">Açıklama</span>
          <input
            className="input"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value || undefined })}
            placeholder="örn. LED modül, demir profil…"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-primary"
            disabled={!form.categoryId || form.amount <= 0 || createMut.isPending}
            onClick={() => createMut.mutate(form)}
          >
            {createMut.isPending ? 'Kaydediliyor…' : 'Gideri Kaydet'}
          </button>
          {(!form.categoryId || form.amount <= 0) && (
            <span className="text-xs text-slate-500">Gider türü ve tutar zorunludur.</span>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {items.length > 0 && (
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-600">Gider listesi</h2>
            <span className="text-xs text-slate-500">
              {totalCount > items.length ? `ilk ${items.length} / ${totalCount} kayıt` : `${items.length} kayıt`}
            </span>
          </div>
        )}
        {expensesLoading ? (
          <LoadingBlock rows={3} />
        ) : items.length === 0 ? (
          activeCount > 0 ? (
            <EmptyState
              icon="🔍"
              title="Filtreye uyan gider yok"
              hint="Tarih aralığını genişletin ya da tür / iş seçimini kaldırın."
              action={
                <button className="btn-secondary" onClick={clearFilters}>
                  Filtreleri temizle
                </button>
              }
            />
          ) : (
            <EmptyState
              icon="🧾"
              title="Gider yok."
              hint="Kira, malzeme, yakıt gibi harcamaları yukarıdaki formdan girin; özet ve rapor kendiliğinden oluşur."
              action={
                <button className="btn-secondary" onClick={focusNewForm}>
                  Gider girmeye başla
                </button>
              }
            />
          )
        ) : (
          items.map((e) => (
            <div key={e.id} className="card flex items-center gap-3 !p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.category?.name ?? '—'}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="tabular-nums">{formatDate(e.expenseDate)}</span>
                  {e.project && (
                    <span className="badge bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                      {e.project.name}
                    </span>
                  )}
                  {e.description && <span className="min-w-0 break-words">{e.description}</span>}
                </p>
              </div>
              <span className="shrink-0 text-right font-semibold tabular-nums">
                {formatMoney(e.amount, e.currency || 'TRY')}
              </span>
              <button
                className="btn-danger-soft btn-sm shrink-0"
                aria-label={`Gideri sil: ${e.category?.name ?? ''} ${formatMoney(e.amount, e.currency || 'TRY')}`}
                title="Gideri sil"
                disabled={deleteMut.isPending}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: 'Gider silinsin mi?',
                    message: `${e.category?.name ?? 'Gider'} · ${formatMoney(e.amount, e.currency || 'TRY')} · ${formatDate(e.expenseDate)}\nBu işlem geri alınamaz.`,
                    confirmText: 'Sil',
                    danger: true,
                  });
                  if (ok) deleteMut.mutate(e.id);
                }}
              >
                Sil
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Özet dağılımı: ad, tutar ve toplam içindeki payı gösteren ince çubuk. */
function Breakdown({
  title,
  rows,
  total,
  bar,
}: {
  title: string;
  rows: { name: string; total: number }[];
  total: number;
  bar: string;
}) {
  const sorted = [...rows].sort((a, b) => Number(b.total) - Number(a.total));
  const max = Math.max(0, ...sorted.map((r) => Number(r.total)));
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {sorted.length ? (
        <ul className="space-y-2">
          {sorted.map((r) => {
            const share = Number(total) > 0 ? Math.round((Number(r.total) / Number(total)) * 100) : 0;
            const width = max > 0 ? Math.max(2, (Number(r.total) / max) * 100) : 0;
            return (
              <li key={r.name}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{r.name}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{formatMoney(r.total)}</span>
                    <span className="ml-1.5 text-xs text-slate-500">%{share}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
    </div>
  );
}

/** #7 Bu ay ödenmemiş sürekli (sabit) giderler — "Ödendi" ile gider oluşturulur. */
function PendingRecurring() {
  const qc = useQueryClient();
  const { data: pending } = useQuery({
    queryKey: ['pending-expenses'],
    queryFn: fetchPendingExpenses,
  });
  const payMut = useMutation({
    mutationFn: (p: { categoryId: string; amount: number }) =>
      createExpense({
        categoryId: p.categoryId,
        amount: p.amount,
        expenseDate: todayISO(),
        description: 'Sürekli gider (ödendi)',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (!pending?.length) return null;
  const total = pending.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="card space-y-2 border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-900/20">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-amber-800 dark:text-amber-200">⏰ Bekleyen sürekli giderler</h2>
        <span className="font-bold tabular-nums text-amber-900 dark:text-amber-100">{formatMoney(total)}</span>
      </div>
      <ul className="divide-y divide-amber-200/70 dark:divide-amber-800/50">
        {pending.map((p) => (
          <li key={p.categoryId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="font-medium text-amber-900 dark:text-amber-100">{p.name}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-amber-800/80 dark:text-amber-200/80">
                <span>vade {formatDate(p.dueDate)}</span>
                {p.overdue && <span className="badge bg-red-100 text-red-700">gecikmiş</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                {formatMoney(p.amount)}
              </span>
              <button
                className="btn-success btn-sm"
                disabled={payMut.isPending}
                title={`${p.name} ödendi olarak gider kaydı oluştur`}
                onClick={() => payMut.mutate({ categoryId: p.categoryId, amount: p.amount })}
              >
                Ödendi
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        Bu tutarlar mali dashboard'da "ödenecek/borç" toplamına dahildir.
      </p>
    </div>
  );
}

/** Gider türü ve iş/proje katalog yönetimi (ekle/sil + sürekli işareti). */
function Catalogs() {
  const qc = useQueryClient();
  const [catName, setCatName] = useState('');
  const [catRecurring, setCatRecurring] = useState(false);
  const [catAmount, setCatAmount] = useState('');
  const [catDay, setCatDay] = useState('');
  const [projName, setProjName] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: fetchExpenseCategories,
  });
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });

  const invCat = () => qc.invalidateQueries({ queryKey: ['expense-categories'] });
  const invProj = () => qc.invalidateQueries({ queryKey: ['projects'] });

  const addCat = useMutation({
    mutationFn: (input: ExpenseCategoryInput) => createExpenseCategory(input),
    onSuccess: () => {
      invCat();
      qc.invalidateQueries({ queryKey: ['pending-expenses'] });
      setCatName('');
      setCatRecurring(false);
      setCatAmount('');
      setCatDay('');
    },
  });
  const toggleCat = useMutation({
    mutationFn: ({ id, isRecurring }: { id: string; isRecurring: boolean }) =>
      updateExpenseCategory(id, { isRecurring }),
    onSuccess: invCat,
  });
  const delCat = useMutation({ mutationFn: deleteExpenseCategory, onSuccess: invCat });
  const addProj = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      invProj();
      setProjName('');
    },
  });
  const delProj = useMutation({ mutationFn: deleteProject, onSuccess: invProj });

  const submitCat = () => {
    if (!catName.trim()) return;
    addCat.mutate({
      name: catName.trim(),
      isRecurring: catRecurring,
      recurringAmount: catRecurring && catAmount ? Number(catAmount) : undefined,
      recurringDayOfMonth: catRecurring && catDay ? Number(catDay) : undefined,
    });
  };
  const submitProj = () => {
    if (projName.trim()) addProj.mutate({ name: projName.trim() });
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="card space-y-3">
        <h2 className="font-semibold">Gider türleri</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input min-w-0 flex-1 basis-40"
            placeholder="+ Yeni tür (örn. Kira)"
            aria-label="Yeni gider türü adı"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitCat()}
          />
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={catRecurring}
              onChange={(e) => setCatRecurring(e.target.checked)}
            />
            Sürekli
          </label>
          <button className="btn-secondary" disabled={!catName.trim() || addCat.isPending} onClick={submitCat}>
            Ekle
          </button>
        </div>
        {catRecurring && (
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <label className="block min-w-0">
              <span className="label">Aylık tutar</span>
              <input
                className="input text-right tabular-nums"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="örn. 1500"
                value={catAmount}
                onChange={(e) => setCatAmount(e.target.value)}
              />
            </label>
            <label className="block min-w-0">
              <span className="label">Ayın günü</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                placeholder="1–31"
                value={catDay}
                onChange={(e) => setCatDay(e.target.value)}
              />
            </label>
          </div>
        )}
        {categories && categories.length === 0 && (
          <p className="text-sm text-slate-500">Henüz gider türü yok.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {categories?.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{c.name}</span>
                {c.isRecurring && c.recurringAmount != null && (
                  <span className="ml-1.5 badge bg-amber-100 text-amber-800">
                    sürekli · {formatMoney(Number(c.recurringAmount))}
                    {c.recurringDayOfMonth ? ` · ${c.recurringDayOfMonth}. gün` : ''}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={c.isRecurring}
                    onChange={(e) => toggleCat.mutate({ id: c.id, isRecurring: e.target.checked })}
                  />
                  Sürekli
                </label>
                <button
                  className="btn-danger-soft btn-sm"
                  aria-label={`"${c.name}" türünü sil`}
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        message: `"${c.name}" gider türü silinsin mi?`,
                        confirmText: 'Sil',
                        danger: true,
                      })
                    )
                      delCat.mutate(c.id);
                  }}
                >
                  Sil
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">İşler / Projeler</h2>
        <div className="flex gap-2">
          <input
            className="input min-w-0 flex-1"
            placeholder="+ Yeni iş (örn. Ahmet Tabela)"
            aria-label="Yeni iş / proje adı"
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitProj()}
          />
          <button className="btn-secondary" disabled={!projName.trim() || addProj.isPending} onClick={submitProj}>
            Ekle
          </button>
        </div>
        {projects && projects.length === 0 && <p className="text-sm text-slate-500">Henüz iş / proje yok.</p>}
        <ul className="divide-y divide-slate-100">
          {projects?.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              <button
                className="btn-danger-soft btn-sm shrink-0"
                aria-label={`"${p.name}" işini sil`}
                onClick={async () => {
                  if (
                    await confirmDialog({
                      message: `"${p.name}" iş / projesi silinsin mi?`,
                      confirmText: 'Sil',
                      danger: true,
                    })
                  )
                    delProj.mutate(p.id);
                }}
              >
                Sil
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

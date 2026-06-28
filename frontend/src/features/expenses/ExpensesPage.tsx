import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
  fetchProjects,
  updateExpenseCategory,
  type ExpenseFilters,
  type ExpenseInput,
} from '../../api/expenses.api';

const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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
  const { data: expenses } = useQuery({
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Giderler</h1>
        <button className="btn bg-slate-100" onClick={() => setShowCatalogs((s) => !s)}>
          {showCatalogs ? 'Katalogları gizle' : 'Tür / İş yönet'}
        </button>
      </div>

      {showCatalogs && (
        <Catalogs />
      )}

      {/* Filtreler */}
      <div className="card grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Başlangıç</span>
          <input
            className="input"
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => setFilter({ from: e.target.value || undefined })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Bitiş</span>
          <input
            className="input"
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => setFilter({ to: e.target.value || undefined })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Gider türü</span>
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
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">İş / Proje</span>
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

      {/* Özet */}
      {summary && (
        <div className="card space-y-2">
          <p className="text-sm">
            Toplam gider:{' '}
            <span className="font-semibold">{money.format(summary.total)}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-slate-500">Türe göre</p>
              {summary.byCategory.map((r) => (
                <p key={r.name} className="text-sm text-slate-600">
                  {r.name}: {money.format(r.total)}
                </p>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">İş/projeye göre</p>
              {summary.byProject.length ? (
                summary.byProject.map((r) => (
                  <p key={r.name} className="text-sm text-slate-600">
                    {r.name}: {money.format(r.total)}
                  </p>
                ))
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </div>
          </div>
          <a className="btn bg-slate-100 text-sm" href={csvHref} download="giderler.csv">
            ⬇ CSV (tablo)
          </a>
        </div>
      )}

      {/* Yeni gider */}
      <div className="card space-y-3">
        <h2 className="font-medium">Yeni gider</h2>
        {createMut.error && (
          <p className="text-sm text-red-600">
            {(createMut.error as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Gider kaydedilemedi.'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Gider türü</span>
            <select
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
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">İş / Proje (varsa)</span>
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
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Tutar</span>
            <input
              className="input"
              type="number"
              min={0}
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Tarih</span>
            <input
              className="input"
              type="date"
              value={form.expenseDate ?? ''}
              onChange={(e) => setForm({ ...form, expenseDate: e.target.value || undefined })}
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Açıklama</span>
          <input
            className="input"
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value || undefined })}
            placeholder="örn. LED modül, demir profil…"
          />
        </label>
        <button
          className="btn-primary"
          disabled={!form.categoryId || form.amount <= 0 || createMut.isPending}
          onClick={() => createMut.mutate(form)}
        >
          Gideri Kaydet
        </button>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {expenses?.items.map((e) => (
          <div key={e.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium">
                {money.format(Number(e.amount))} · {e.category?.name ?? '—'}
              </p>
              <p className="text-sm text-slate-500">
                {e.expenseDate}
                {e.project ? ` · ${e.project.name}` : ''}
                {e.description ? ` · ${e.description}` : ''}
              </p>
            </div>
            <button
              className="btn text-red-600"
              onClick={() => {
                if (confirm('Gider silinsin mi?')) deleteMut.mutate(e.id);
              }}
            >
              Sil
            </button>
          </div>
        ))}
        {!expenses?.items.length && <p className="text-slate-400">Gider yok.</p>}
      </div>
    </div>
  );
}

/** Gider türü ve iş/proje katalog yönetimi (ekle/sil + sürekli işareti). */
function Catalogs() {
  const qc = useQueryClient();
  const [catName, setCatName] = useState('');
  const [catRecurring, setCatRecurring] = useState(false);
  const [projName, setProjName] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: fetchExpenseCategories,
  });
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });

  const invCat = () => qc.invalidateQueries({ queryKey: ['expense-categories'] });
  const invProj = () => qc.invalidateQueries({ queryKey: ['projects'] });

  const addCat = useMutation({
    mutationFn: createExpenseCategory,
    onSuccess: () => {
      invCat();
      setCatName('');
      setCatRecurring(false);
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

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="card space-y-2">
        <h2 className="font-medium">Gider türleri</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="+ Yeni tür (örn. Kira)"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={catRecurring}
              onChange={(e) => setCatRecurring(e.target.checked)}
            />
            Sürekli
          </label>
          <button
            className="btn"
            disabled={!catName.trim()}
            onClick={() => addCat.mutate({ name: catName.trim(), isRecurring: catRecurring })}
          >
            Ekle
          </button>
        </div>
        {categories?.map((c) => (
          <div key={c.id} className="flex items-center justify-between text-sm">
            <span>{c.name}</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={c.isRecurring}
                  onChange={(e) => toggleCat.mutate({ id: c.id, isRecurring: e.target.checked })}
                />
                Sürekli
              </label>
              <button className="text-red-600" onClick={() => delCat.mutate(c.id)}>
                Sil
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card space-y-2">
        <h2 className="font-medium">İşler / Projeler</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="+ Yeni iş (örn. Ahmet Tabela)"
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
          />
          <button
            className="btn"
            disabled={!projName.trim()}
            onClick={() => addProj.mutate({ name: projName.trim() })}
          >
            Ekle
          </button>
        </div>
        {projects?.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm">
            <span>{p.name}</span>
            <button className="text-red-600" onClick={() => delProj.mutate(p.id)}>
              Sil
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

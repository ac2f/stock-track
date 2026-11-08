import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveBusiness,
  fetchBusinesses,
  fetchLabelsAdmin,
  fetchPlatformStats,
  updateBusiness,
  type BusinessAdminPatch,
  type BusinessRow,
  type BusinessStatus,
} from '../../api/platform.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { Pagination } from '../../components/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { SearchInput } from '../../components/ui/SearchInput';
import { useDebounced } from '../../hooks/useDebounced';
import { apiErrorMessage, toast } from '../../lib/toast';
import { SHOP_FEATURES } from '../../lib/shop';
import type { ShopFeatureKey } from '../../types';
import { PagePlaceholderError } from '../directory/parts';

const STATUS: Record<BusinessStatus, { label: string; cls: string }> = {
  pending: { label: 'Onay bekliyor', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  active: { label: 'Etkin', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  suspended: { label: 'Askıda', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
};

type Filter = BusinessStatus | 'expiring' | '';

export function BusinessesTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('');
  const [search, setSearch] = useState('');
  const [labelId, setLabelId] = useState('');
  const [feature, setFeature] = useState<ShopFeatureKey | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const q = useDebounced(search.trim(), 350);
  const labels = useQuery({ queryKey: ['platform', 'labels'], queryFn: fetchLabelsAdmin, staleTime: 60_000 });

  const stats = useQuery({ queryKey: ['platform', 'stats'], queryFn: fetchPlatformStats, refetchInterval: 60_000 });
  const list = useQuery({
    queryKey: ['platform', 'businesses', filter, q, labelId, feature, page, pageSize],
    queryFn: () =>
      fetchBusinesses({
        status: filter && filter !== 'expiring' ? filter : undefined,
        expiring: filter === 'expiring' ? true : undefined,
        search: q || undefined,
        labelId: labelId || undefined,
        feature: feature || undefined,
        page,
        limit: pageSize,
      }),
    placeholderData: keepPreviousData,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['platform'] });
  };

  const cards: { id: Filter; label: string; value?: number; tone: string }[] = [
    { id: '', label: 'Tümü', value: stats.data?.total, tone: 'text-slate-900 dark:text-slate-100' },
    { id: 'pending', label: 'Onay bekleyen', value: stats.data?.pending, tone: 'text-amber-700 dark:text-amber-300' },
    { id: 'active', label: 'Etkin', value: stats.data?.active, tone: 'text-emerald-700 dark:text-emerald-300' },
    { id: 'suspended', label: 'Askıda', value: stats.data?.suspended, tone: 'text-red-700 dark:text-red-300' },
    { id: 'expiring', label: 'Süresi biten / bitmek üzere', value: (stats.data?.expiringSoon ?? 0) + (stats.data?.expired ?? 0), tone: 'text-orange-700 dark:text-orange-300' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => {
              setFilter(c.id);
              setPage(1);
            }}
            className={`card text-left transition hover:border-blue-300 ${filter === c.id ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900' : ''}`}
          >
            <div className={`text-2xl font-bold ${c.tone}`}>{c.value ?? '…'}</div>
            <div className="text-xs text-slate-500">{c.label}</div>
          </button>
        ))}
      </div>
      <div className="card space-y-3">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="İşletme, e-posta, telefon, il/ilçe ara…" />
        {/* İş kolu etiketine (malzemeci, baskıcı, atölye, montaj ...) ve açılan özelliğe göre süz. */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="İş koluna göre süz">
          <span className="text-xs font-medium text-slate-500">İş kolu:</span>
          <button
            type="button"
            className={`badge min-h-[32px] px-3 ${labelId === '' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}
            onClick={() => { setLabelId(''); setPage(1); }}
          >
            Tümü
          </button>
          {(labels.data ?? []).filter((l) => l.isActive !== false).map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={labelId === l.id}
              className={`badge min-h-[32px] px-3 ${labelId === l.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}
              onClick={() => { setLabelId(labelId === l.id ? '' : l.id); setPage(1); }}
            >
              {l.name}
              {typeof l.shopCount === 'number' && <span className="ml-1 opacity-70">{l.shopCount}</span>}
            </button>
          ))}
        </div>
        <label className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          Özellik:
          <select
            className="input w-auto min-w-[14rem]"
            value={feature}
            onChange={(e) => { setFeature(e.target.value as ShopFeatureKey | ''); setPage(1); }}
            aria-label="Açık özelliğe göre süz"
          >
            <option value="">Hepsi</option>
            {SHOP_FEATURES.map((f) => (
              <option key={f.key} value={f.key}>{f.label} açık olanlar</option>
            ))}
          </select>
        </label>
      </div>

      {list.isError && <PagePlaceholderError />}
      {list.isLoading && <LoadingBlock rows={3} />}
      {list.data?.items.length === 0 && <EmptyState icon="🏭" title="Bu süzgeçle işletme yok" />}
      <div className="space-y-3">
        {list.data?.items.map((b) => (
          <BusinessCard key={b.id} b={b} onChanged={refresh} />
        ))}
      </div>
      {list.data && list.data.meta.total > 0 && (
        <Pagination
          page={list.data.meta.page}
          pageCount={list.data.meta.pageCount}
          total={list.data.meta.total}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}

function BusinessCard({ b, onChanged }: { b: BusinessRow; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState(b.subscriptionUntil ?? '');
  const [plan, setPlan] = useState(b.plan);
  const [note, setNote] = useState(b.adminNote ?? '');

  const patch = useMutation({
    mutationFn: (p: BusinessAdminPatch) => updateBusiness(b.id, p),
    onSuccess: () => {
      toast.success('Güncellendi');
      onChanged();
    },
    onError: (e) => toast.error('Güncellenemedi', apiErrorMessage(e)),
  });
  const approve = useMutation({
    mutationFn: () => approveBusiness(b.id),
    onSuccess: () => {
      toast.success('İşletme onaylandı', `${b.name} artık sisteme girebilir.`);
      onChanged();
    },
    onError: (e) => toast.error('Onaylanamadı', apiErrorMessage(e)),
  });
  const busy = patch.isPending || approve.isPending;
  const st = STATUS[b.status];
  const left = b.daysLeft;

  return (
    <article className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            {b.name}
            <span className={`badge ${st.cls}`}>{st.label}</span>
            {!b.isActive && <span className="badge bg-slate-200 text-slate-700">Kapalı</span>}
            {b.directoryVisible && <span className="badge bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">Rehberde</span>}
            {b.features.corel && <span className="badge bg-violet-50 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">Corel</span>}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            📍 {[b.district, b.province].filter(Boolean).join(', ') || '—'} · kayıt {new Date(b.createdAt).toLocaleDateString('tr-TR')}
          </p>
          {b.admins.map((a) => (
            <p key={a.email} className="text-xs text-slate-500">
              👤 {a.fullName} · <a className="hover:underline" href={`mailto:${a.email}`}>{a.email}</a>
              {a.phone ? ` · ${a.phone}` : ''}
            </p>
          ))}
        </div>
        <div className="text-right text-xs">
          <p className="font-medium">
            {b.plan}
            {b.subscriptionUntil ? ` · ${b.subscriptionUntil}` : ' · süresiz'}
          </p>
          {left !== null && (
            <p className={left < 0 ? 'font-semibold text-red-600' : left <= 7 ? 'font-semibold text-orange-600' : 'text-slate-500'}>
              {left < 0 ? `${-left} gün önce bitti` : left === 0 ? 'bugün bitiyor' : `${left} gün kaldı`}
            </p>
          )}
          <p className="text-slate-500">
            {b.memberCount} üye · {b.machineCount} makine
          </p>
        </div>
      </div>
      {b.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {b.labels.map((l) => (
            <span key={l} className="badge bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {l}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {b.status === 'pending' && (
          <button className="btn-success btn-sm" disabled={busy} onClick={() => approve.mutate()}>
            {approve.isPending && <Spinner />} ✓ Onayla
          </button>
        )}
        {b.status === 'active' && (
          <button
            className="btn-danger-soft btn-sm"
            disabled={busy}
            onClick={async () => {
              if (await confirmDialog({ title: 'Hesap askıya alınsın mı?', message: `"${b.name}" sisteme giremeyecek ve rehberden kalkacak. Verileri silinmez.`, confirmText: 'Askıya al', danger: true })) {
                patch.mutate({ status: 'suspended' });
              }
            }}
          >
            ⛔ Askıya al
          </button>
        )}
        {b.status === 'suspended' && (
          <button className="btn-success btn-sm" disabled={busy} onClick={() => patch.mutate({ status: 'active' })}>
            Yeniden etkinleştir
          </button>
        )}
        <button className="btn-secondary btn-sm" disabled={busy} onClick={() => patch.mutate({ extendDays: 30 })}>
          +30 gün
        </button>
        <button className="btn-secondary btn-sm" disabled={busy} onClick={() => patch.mutate({ extendDays: 365 })}>
          +1 yıl
        </button>
        <button className="btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Kapat' : 'Ayrıntı / not'}
        </button>
      </div>

      {open && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label">Plan</span>
              <input className="input" value={plan} maxLength={40} onChange={(e) => setPlan(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Kiralama bitişi (boş = süresiz)</span>
              <input className="input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
            <div className="flex items-end">
              <button
                className="btn-primary w-full"
                disabled={busy}
                onClick={() => patch.mutate({ plan: plan.trim() || 'standard', subscriptionUntil: until || null, adminNote: note.trim() || null })}
              >
                {patch.isPending && <Spinner />} Kaydet
              </button>
            </div>
          </div>
          <label className="block">
            <span className="label">Yönetici notu (işletme görmez)</span>
            <textarea className="input min-h-[64px] py-2" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={b.directoryVisible}
              disabled={busy}
              onChange={(e) => patch.mutate({ directoryVisible: e.target.checked })}
            />
            Rehberde göster
          </label>

          {/* Bu işletmenin kullanabileceği hizmetler: yalnız siz açıp kapatırsınız; işletme kendisi açamaz. */}
          <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-1 text-sm font-semibold">Açılan özellikler</legend>
            {SHOP_FEATURES.map((f) => (
              <label key={f.key} className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0"
                  checked={b.features[f.key]}
                  disabled={busy}
                  onChange={(e) => patch.mutate({ features: { [f.key]: e.target.checked } })}
                />
                <span className="min-w-0">
                  <span className="block font-medium">{f.label}</span>
                  <span className="block text-xs text-slate-500">{f.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </article>
  );
}

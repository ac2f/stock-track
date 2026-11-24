import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { confirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import {
  createServiceBundle,
  createServiceGroup,
  createServiceType,
  deleteServiceBundle,
  deleteServiceGroup,
  deleteServiceType,
  fetchServiceCatalog,
  updateServiceBundle,
  updateServiceGroup,
  updateServiceType,
  type ServiceBundle,
  type ServiceBundleInput,
  type ServiceGroup,
  type ServiceType,
  type ServiceTypeInput,
} from '../../api/services.api';
import { tierRange, UNIT_SHORT } from '../../lib/services';
import { formatMoney, formatNumber } from '../../lib/format';
import { apiErrorMessage, toast } from '../../lib/toast';
import type { MeasurementType } from '../../types';

const UNITS: { value: MeasurementType; label: string }[] = [
  { value: 'length', label: 'Metre' },
  { value: 'piece', label: 'Adet' },
  { value: 'area', label: 'm²' },
  { value: 'time', label: 'Saat' },
  { value: 'weight', label: 'kg' },
];

/** Sayı alanı: boş → null, virgül de kabul. */
function num(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const str = (v: number | null | undefined) => (v == null ? '' : String(Number(v)));

/**
 * Hizmet listesi: gruplar (Harf İşleri, Montaj…) → hizmet türleri (Harf büküm, Harf yapıştırma…)
 * → ölçüye göre fiyat kademeleri ("10 cm altı harf 15 ₺"). Kombinasyon indirimleri, paketteki
 * hizmetlerin hepsi aynı teklifte olunca teklife ayrı bir indirim satırı olarak kendiliğinden eklenir.
 */
export function ServicesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canWrite = can('catalog', 'write');
  const { data, isLoading } = useQuery({ queryKey: ['service-catalog', 'all'], queryFn: () => fetchServiceCatalog(false) });
  const [typeForm, setTypeForm] = useState<{ id: string | null; input: ServiceTypeInput } | null>(null);
  const [bundleForm, setBundleForm] = useState<{ id: string | null; input: ServiceBundleInput } | null>(null);
  const [newGroup, setNewGroup] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['service-catalog'] });
  const onError = (e: unknown) => toast.error(apiErrorMessage(e, 'Kaydedilemedi.'));

  const groupMut = useMutation({
    mutationFn: (v: { id?: string; name?: string; isActive?: boolean }) =>
      v.id ? updateServiceGroup(v.id, { name: v.name, isActive: v.isActive }) : createServiceGroup({ name: v.name ?? '' }),
    onSuccess: () => {
      setNewGroup(null);
      void refresh();
    },
    onError,
  });
  const delMut = useMutation({
    mutationFn: (v: { kind: 'group' | 'type' | 'bundle'; id: string }) =>
      v.kind === 'group' ? deleteServiceGroup(v.id) : v.kind === 'type' ? deleteServiceType(v.id) : deleteServiceBundle(v.id),
    onSuccess: () => {
      toast.success('Silindi');
      void refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Silinemedi.')),
  });

  const groups = data?.groups ?? [];
  const allTypes = groups.flatMap((g) => g.types);
  const typeName = (id: string) => allTypes.find((t) => t.id === id)?.name ?? 'silinmiş hizmet';

  const startType = (groupId: string) =>
    setTypeForm({
      id: null,
      input: { groupId, name: '', unit: 'piece', measureLabel: null, note: null, isActive: true, tiers: [{ name: 'Standart', price: 0 }] },
    });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hizmetler"
        icon="🛠️"
        subtitle="Teklifte “Hizmet kalemi” buradan fiyatlanır. Kademeli fiyat (ör. harf boyuna göre) ve birlikte alınan hizmetlere kombinasyon indirimi tanımlanır. Teklif onaylanınca hizmetler iş kuyruğuna düşer."
        actions={
          canWrite && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setNewGroup('')}>
              + Grup
            </button>
          )
        }
      />

      {newGroup != null && (
        <form
          className="card flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newGroup.trim()) groupMut.mutate({ name: newGroup.trim() });
          }}
        >
          <label className="block min-w-0 flex-1">
            <span className="label">Yeni grup adı</span>
            <input className="input" autoFocus value={newGroup} placeholder="ör. Harf İşleri" onChange={(e) => setNewGroup(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary" disabled={!newGroup.trim() || groupMut.isPending}>
            Ekle
          </button>
          <button type="button" className="btn-ghost" onClick={() => setNewGroup(null)}>
            Vazgeç
          </button>
        </form>
      )}

      {typeForm && (
        <TypeForm
          key={typeForm.id ?? 'new'}
          groups={groups}
          initial={typeForm.input}
          editingId={typeForm.id}
          onCancel={() => setTypeForm(null)}
          onSaved={() => {
            setTypeForm(null);
            toast.success('Hizmet kaydedildi');
            void refresh();
          }}
        />
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : !groups.length ? (
        <EmptyState icon="🛠️" title="Henüz hizmet grubu yok" hint="Önce bir grup (ör. Harf İşleri) ekleyin, sonra hizmetleri." />
      ) : (
        groups.map((g) => (
          <section key={g.id} className={`space-y-2 ${g.isActive ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{g.name}</h2>
              <span className="text-xs text-slate-400">{g.types.length} hizmet</span>
              {!g.isActive && <span className="rounded-full bg-slate-200 px-2 text-xs dark:bg-slate-700">pasif</span>}
              {canWrite && (
                <span className="ml-auto flex flex-wrap gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => startType(g.id)}>
                    + Hizmet
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      const name = window.prompt('Grup adı', g.name)?.trim();
                      if (name && name !== g.name) groupMut.mutate({ id: g.id, name });
                    }}
                  >
                    Adı
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => groupMut.mutate({ id: g.id, isActive: !g.isActive })}>
                    {g.isActive ? 'Pasifleştir' : 'Etkinleştir'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm text-red-700 dark:text-red-400"
                    onClick={async () => {
                      if (await confirmDialog({ title: `“${g.name}” grubu silinsin mi?`, message: 'İçindeki hizmetler de listeden kalkar; eski teklifler etkilenmez.', danger: true }))
                        delMut.mutate({ kind: 'group', id: g.id });
                    }}
                  >
                    Sil
                  </button>
                </span>
              )}
            </div>
            {!g.types.length ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-600">Bu grupta hizmet yok.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {g.types.map((t) => (
                  <TypeCard
                    key={t.id}
                    type={t}
                    canWrite={canWrite}
                    onEdit={() =>
                      setTypeForm({
                        id: t.id,
                        input: {
                          groupId: t.groupId,
                          name: t.name,
                          unit: t.unit,
                          measureLabel: t.measureLabel,
                          note: t.note,
                          isActive: t.isActive,
                          tiers: t.tiers.map((x) => ({
                            id: x.id,
                            name: x.name,
                            minMeasure: x.minMeasure,
                            maxMeasure: x.maxMeasure,
                            unit: x.unit,
                            price: Number(x.price),
                            currency: x.currency,
                          })),
                        },
                      })
                    }
                    onDelete={async () => {
                      if (await confirmDialog({ title: `“${t.name}” silinsin mi?`, message: 'Eski teklif ve işler etkilenmez.', danger: true }))
                        delMut.mutate({ kind: 'type', id: t.id });
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        ))
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Kombinasyon indirimleri</h2>
          {canWrite && allTypes.length >= 2 && (
            <button
              type="button"
              className="btn-ghost btn-sm ml-auto"
              onClick={() => setBundleForm({ id: null, input: { name: '', serviceTypeIds: [], discountKind: 'percent', discountValue: 10, isActive: true } })}
            >
              + İndirim
            </button>
          )}
        </div>
        {bundleForm && (
          <BundleForm
            key={bundleForm.id ?? 'new'}
            groups={groups}
            initial={bundleForm.input}
            editingId={bundleForm.id}
            onCancel={() => setBundleForm(null)}
            onSaved={() => {
              setBundleForm(null);
              toast.success('İndirim kaydedildi');
              void refresh();
            }}
          />
        )}
        {!data?.bundles.length ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-600">
            Tanımlı indirim yok. Ör. “Büküm + yapıştırma birlikte %10”.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {data.bundles.map((b) => (
              <div key={b.id} className={`card flex flex-wrap items-start gap-2 ${b.isActive ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {b.name}
                    {!b.isActive && <span className="ml-2 rounded-full bg-slate-200 px-2 text-xs font-normal dark:bg-slate-700">pasif</span>}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{b.serviceTypeIds.map(typeName).join(' + ')}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {b.discountKind === 'percent' ? `%${formatNumber(Number(b.discountValue))}` : `−${formatMoney(b.discountValue)}`}
                </span>
                {canWrite && (
                  <span className="flex w-full justify-end gap-1">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setBundleForm({ id: b.id, input: bundleInput(b) })}>
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm text-red-700 dark:text-red-400"
                      onClick={async () => {
                        if (await confirmDialog({ title: 'İndirim silinsin mi?', message: `“${b.name}” indirimi silinsin mi? Kaydedilmiş teklifler etkilenmez.`, danger: true })) delMut.mutate({ kind: 'bundle', id: b.id });
                      }}
                    >
                      Sil
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const bundleInput = (b: ServiceBundle): ServiceBundleInput => ({
  name: b.name,
  serviceTypeIds: b.serviceTypeIds,
  discountKind: b.discountKind,
  discountValue: Number(b.discountValue),
  isActive: b.isActive,
});

function TypeCard({ type: t, canWrite, onEdit, onDelete }: { type: ServiceType; canWrite: boolean; onEdit: () => void; onDelete: () => void }) {
  const unit = UNIT_SHORT[t.unit];
  return (
    <div className={`card space-y-2 ${t.isActive ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {t.name}
            {!t.isActive && <span className="ml-2 rounded-full bg-slate-200 px-2 text-xs font-normal dark:bg-slate-700">pasif</span>}
          </p>
          <p className="text-xs text-slate-500">
            {unit} başına{t.measureLabel ? ` · kademe ölçüsü: ${t.measureLabel}` : ''}
            {t.note ? ` · ${t.note}` : ''}
          </p>
        </div>
        {canWrite && (
          <span className="flex gap-1">
            <button type="button" className="btn-ghost btn-sm" onClick={onEdit}>
              Düzenle
            </button>
            <button type="button" className="btn-ghost btn-sm text-red-700 dark:text-red-400" onClick={onDelete} aria-label={`${t.name} sil`}>
              Sil
            </button>
          </span>
        )}
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 text-sm dark:divide-slate-700 dark:border-slate-700">
        {t.tiers.map((x) => (
          <li key={x.id} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate">{x.name}</span>
            {t.measureLabel && <span className="text-xs text-slate-500">{tierRange(x)}</span>}
            <span className="font-semibold tabular-nums">
              {formatMoney(x.price, x.currency)}
              <span className="font-normal text-slate-500"> / {UNIT_SHORT[x.unit ?? t.unit]}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TierDraft {
  id?: string;
  name: string;
  min: string;
  max: string;
  price: string;
  unit: MeasurementType | null;
  currency?: string;
}

function TypeForm({
  groups,
  initial,
  editingId,
  onCancel,
  onSaved,
}: {
  groups: ServiceGroup[];
  initial: ServiceTypeInput;
  editingId: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(initial);
  const [tiers, setTiers] = useState<TierDraft[]>(
    initial.tiers.map((x) => ({
      id: x.id,
      name: x.name,
      min: str(x.minMeasure),
      max: str(x.maxMeasure),
      price: str(x.price),
      unit: x.unit ?? null,
      currency: x.currency,
    })),
  );
  const hasMeasure = !!f.measureLabel?.trim();
  const tierErrors = tiers.map((t) => {
    if (!t.name.trim()) return 'Ad girin';
    if (num(t.price) == null) return 'Fiyat girin';
    const lo = num(t.min);
    const hi = num(t.max);
    if (hasMeasure && lo != null && hi != null && hi <= lo) return 'Üst sınır alttan büyük olmalı';
    return null;
  });
  const valid = f.name.trim() && f.groupId && tiers.length > 0 && tierErrors.every((e) => !e);

  const save = useMutation({
    mutationFn: () => {
      const input: ServiceTypeInput = {
        ...f,
        name: f.name.trim(),
        measureLabel: f.measureLabel?.trim() || null,
        note: f.note?.trim() || null,
        tiers: tiers.map((t) => ({
          id: t.id,
          name: t.name.trim(),
          minMeasure: hasMeasure ? num(t.min) : null,
          maxMeasure: hasMeasure ? num(t.max) : null,
          unit: t.unit,
          price: num(t.price) ?? 0,
          currency: t.currency,
        })),
      };
      return editingId ? updateServiceType(editingId, input) : createServiceType(input);
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(apiErrorMessage(e, 'Kaydedilemedi.')),
  });
  const setTier = (i: number, patch: Partial<TierDraft>) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <form
      className="card space-y-4 ring-2 ring-blue-200 dark:ring-blue-900"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <h2 className="font-semibold">{editingId ? 'Hizmeti düzenle' : 'Yeni hizmet'}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block min-w-0">
          <span className="label">Grup</span>
          <select className="input" value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="label">
            Hizmet adı <span className="text-red-600">*</span>
          </span>
          <input className="input" autoFocus value={f.name} placeholder="ör. Harf yapıştırma" onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="block min-w-0">
          <span className="label">Fiyat birimi</span>
          <select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as MeasurementType })}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label} başına
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="label">Kademe ölçüsü (isteğe bağlı)</span>
          <input
            className="input"
            value={f.measureLabel ?? ''}
            placeholder="ör. Harf boyu (cm)"
            onChange={(e) => setF({ ...f, measureLabel: e.target.value })}
          />
        </label>
      </div>
      <label className="block min-w-0">
        <span className="label">Not</span>
        <input className="input" value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </label>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Fiyat kademeleri
          <span className="ml-1 normal-case font-normal">
            {hasMeasure
              ? `— ölçü alt sınır ≤ ${f.measureLabel} < üst sınır; boş sınır “sınırsız”. Birim, kademeye özel seçilebilir (ör. büyük harfte metre).`
              : '— ölçü yoksa ilk kademe varsayılan; diğerleri teklifte elle seçilir.'}
          </span>
        </p>
        {tiers.map((t, i) => (
          <div key={t.id ?? `n${i}`} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-6 dark:border-slate-700">
            <label className="col-span-2 block min-w-0">
              <span className="label">Kademe adı</span>
              <input className="input" value={t.name} placeholder="ör. 10 cm altı" onChange={(e) => setTier(i, { name: e.target.value })} />
            </label>
            {hasMeasure && (
              <>
                <label className="block min-w-0">
                  <span className="label">Alt sınır</span>
                  <input className="input" inputMode="decimal" value={t.min} placeholder="—" onChange={(e) => setTier(i, { min: e.target.value })} />
                </label>
                <label className="block min-w-0">
                  <span className="label">Üst sınır</span>
                  <input className="input" inputMode="decimal" value={t.max} placeholder="—" onChange={(e) => setTier(i, { max: e.target.value })} />
                </label>
              </>
            )}
            <label className="block min-w-0">
              <span className="label">Birim</span>
              <select
                className="input"
                value={t.unit ?? ''}
                onChange={(e) => setTier(i, { unit: (e.target.value || null) as MeasurementType | null })}
              >
                <option value="">{UNIT_SHORT[f.unit]} (hizmetin)</option>
                {UNITS.filter((u) => u.value !== f.unit).map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="label">Fiyat</span>
              <input className="input" inputMode="decimal" value={t.price} onChange={(e) => setTier(i, { price: e.target.value })} />
            </label>
            <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-6">
              <span className="text-xs text-red-600">{tierErrors[i]}</span>
              {tiers.length > 1 && (
                <button type="button" className="btn-ghost btn-sm text-red-700 dark:text-red-400" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))}>
                  Kademeyi kaldır
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => {
            const last = tiers[tiers.length - 1];
            setTiers((ts) => [...ts, { name: '', min: last?.max ?? '', max: '', price: '', unit: null }]);
          }}
        >
          + Kademe
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isActive !== false} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
          Teklifte seçilebilir
        </label>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Vazgeç
          </button>
          <button type="submit" className="btn-primary" disabled={!valid || save.isPending}>
            {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </span>
      </div>
    </form>
  );
}

function BundleForm({
  groups,
  initial,
  editingId,
  onCancel,
  onSaved,
}: {
  groups: ServiceGroup[];
  initial: ServiceBundleInput;
  editingId: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(initial);
  const [value, setValue] = useState(str(initial.discountValue));
  const v = num(value);
  const valid =
    f.name.trim() && new Set(f.serviceTypeIds).size >= 2 && v != null && v > 0 && (f.discountKind !== 'percent' || v <= 100);
  const save = useMutation({
    mutationFn: () => {
      const input = { ...f, name: f.name.trim(), discountValue: v ?? 0 };
      return editingId ? updateServiceBundle(editingId, input) : createServiceBundle(input);
    },
    onSuccess: onSaved,
    onError: (e) => toast.error(apiErrorMessage(e, 'Kaydedilemedi.')),
  });
  const toggle = (id: string) =>
    setF((s) => ({ ...s, serviceTypeIds: s.serviceTypeIds.includes(id) ? s.serviceTypeIds.filter((x) => x !== id) : [...s.serviceTypeIds, id] }));

  return (
    <form
      className="card space-y-3 ring-2 ring-emerald-200 dark:ring-emerald-900"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <h3 className="font-semibold">{editingId ? 'İndirimi düzenle' : 'Yeni kombinasyon indirimi'}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block min-w-0">
          <span className="label">Ad</span>
          <input className="input" autoFocus value={f.name} placeholder="ör. Büküm + yapıştırma" onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="block min-w-0">
          <span className="label">İndirim türü</span>
          <select className="input" value={f.discountKind} onChange={(e) => setF({ ...f, discountKind: e.target.value as 'percent' | 'fixed' })}>
            <option value="percent">Yüzde (%)</option>
            <option value="fixed">Sabit tutar (₺)</option>
          </select>
        </label>
        <label className="block min-w-0">
          <span className="label">{f.discountKind === 'percent' ? 'Yüzde' : 'Tutar'}</span>
          <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Birlikte alınması gereken hizmetler (en az 2) · {f.serviceTypeIds.length} seçili
        </p>
        {groups.map((g) =>
          g.types.length ? (
            <div key={g.id} className="flex flex-wrap items-center gap-1.5">
              <span className="w-full text-xs text-slate-500 sm:w-auto">{g.name}:</span>
              {g.types.map((t) => {
                const on = f.serviceTypeIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      on
                        ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => toggle(t.id)}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          ) : null,
        )}
      </div>
      <p className="text-xs text-slate-500">
        Teklifte bu hizmetlerin hepsi varsa indirim, bu hizmetlerin toplamı üzerinden ayrı satır olarak eklenir. Birden çok indirim uyarsa
        en büyüğü uygulanır.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isActive !== false} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
          Etkin
        </label>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Vazgeç
          </button>
          <button type="submit" className="btn-primary" disabled={!valid || save.isPending}>
            Kaydet
          </button>
        </span>
      </div>
    </form>
  );
}

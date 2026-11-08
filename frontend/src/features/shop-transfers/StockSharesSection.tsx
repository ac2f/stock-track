import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  deleteStockShare,
  fetchStockShares,
  setAllStockShares,
  updateStockShare,
  upsertStockShare,
  type StockShare,
  type StockShareKind,
  type StockShareVisibility,
} from '../../api/trade.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { SearchSelect } from '../../components/SearchSelect';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useMaterialCategories, useMaterialTemplates } from '../../hooks/useReferenceData';
import { stripNamePlaceholders } from '../../lib/plateLabel';
import { apiErrorMessage, toast } from '../../lib/toast';
import type { Plate } from '../../types';
import { TransferPlatePicker } from './NewTransferForm';
import { alertBox, Field, infoBox } from './shared';

const KIND_LABEL: Record<StockShareKind, string> = {
  category: 'Malzeme türü (grup)',
  template: 'Ürün türü',
  plate: 'Tek kalem',
};

const KIND_HINT: Record<StockShareKind, string> = {
  category: 'Örn. tüm Pleksi stoğum',
  template: 'Örn. 3 mm Şeffaf Pleksi kalemlerim',
  plate: 'Yalnız seçtiğim tek stok kalemi',
};

const VISIBILITY_LABEL: Record<StockShareVisibility, string> = {
  public: 'Herkese açık',
  partners: 'Yalnız yetki verdiklerim',
};

/**
 * "Bende var, satıyorum": hangi stokların diğer işletmelere listeleneceğini seçersiniz — tek kalem, ürün türü ya da
 * bir malzeme grubunun tamamı. Her kural istendiği an kapatılır; kapatılan stok listeden anında kalkar.
 */
export function StockSharesSection() {
  const { can, shop } = useAuth();
  const canWrite = can('stock', 'write');
  const qc = useQueryClient();
  const { data: shares, isLoading, isError, error } = useQuery({
    queryKey: ['stock-shares', shop?.id],
    queryFn: fetchStockShares,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stock-shares'] });
    qc.invalidateQueries({ queryKey: ['marketplace'] });
  };

  const [kind, setKind] = useState<StockShareKind>('category');
  const [refId, setRefId] = useState('');
  const [visibility, setVisibility] = useState<StockShareVisibility>('public');
  const [note, setNote] = useState('');
  const [pickedPlate, setPickedPlate] = useState<Plate | undefined>();
  const { data: categories } = useMaterialCategories();
  const { data: templates } = useMaterialTemplates({ enabled: kind === 'template' });

  const add = useMutation({
    mutationFn: () => upsertStockShare({ kind, refId, visibility, isActive: true, note: note.trim() || null }),
    onSuccess: (s) => {
      toast.success('Listeye eklendi', `"${s.label}" — ${s.itemCount} kalem şu an listeleniyor.`);
      setRefId('');
      setPickedPlate(undefined);
      setNote('');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Eklenemedi.')),
    onSettled: refresh,
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; p: { visibility?: StockShareVisibility; isActive?: boolean } }) => updateStockShare(v.id, v.p),
    onError: (e) => toast.error(apiErrorMessage(e, 'Güncellenemedi.')),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteStockShare(id),
    onError: (e) => toast.error(apiErrorMessage(e, 'Silinemedi.')),
    onSettled: refresh,
  });
  const setAll = useMutation({
    mutationFn: (on: boolean) => setAllStockShares(on),
    onSuccess: (r, on) => toast.success(on ? 'Tüm paylaşımlar açıldı' : 'Tüm paylaşımlar kapatıldı', `${r.changed} kural güncellendi.`),
    onError: (e) => toast.error(apiErrorMessage(e, 'Güncellenemedi.')),
    onSettled: refresh,
  });

  const activeCount = shares?.filter((s) => s.isActive).length ?? 0;
  const listed = shares?.filter((s) => s.isActive).reduce((n, s) => n + s.itemCount, 0) ?? 0;

  return (
    <div className="space-y-4">
      <p className={infoBox}>
        "Bende var" listesine koyduğunuz stoklar diğer işletmelere <b>yalnız ad, ebat, adet ve liste fiyatıyla</b> görünür.
        Maliyetiniz, alış bilgileriniz ve müşterileriniz hiçbir zaman paylaşılmaz. Stoğu biten kalem kendiliğinden listeden kalkar.
      </p>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-semibold">
            {activeCount > 0 ? `${activeCount} kural açık · ${listed} kalem listeleniyor` : 'Şu an hiçbir stok paylaşılmıyor'}
          </p>
          <p className="text-xs text-slate-500">Tek tuşla bütün paylaşımı durdurabilir ya da yeniden açabilirsiniz.</p>
        </div>
        {canWrite && (shares?.length ?? 0) > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={setAll.isPending || activeCount === shares!.length}
              onClick={() => setAll.mutate(true)}
            >
              Tümünü aç
            </button>
            <button
              type="button"
              className="btn-danger-soft btn-sm"
              disabled={setAll.isPending || activeCount === 0}
              onClick={async () => {
                if (await confirmDialog({ message: 'Bütün stok paylaşımı kapatılsın mı? Hiçbir stoğunuz başka işletmelere listelenmez.', confirmText: 'Tümünü kapat', danger: true }))
                  setAll.mutate(false);
              }}
            >
              Tümünü kapat
            </button>
          </div>
        )}
      </div>

      {canWrite && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold">Paylaşıma ekle</h2>
          {add.isError && (
            <p role="alert" className={alertBox}>
              {apiErrorMessage(add.error, 'Eklenemedi.')}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(['category', 'template', 'plate'] as StockShareKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                className={`rounded-lg border px-2.5 py-1.5 text-left text-sm ${kind === k ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-700'}`}
                onClick={() => {
                  setKind(k);
                  setRefId('');
                  setPickedPlate(undefined);
                }}
              >
                <span className="block font-semibold">{KIND_LABEL[k]}</span>
                <span className="block text-[11px] text-slate-500">{KIND_HINT[k]}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label={`${KIND_LABEL[kind]} *`} className="sm:col-span-2">
              {kind === 'plate' ? (
                <TransferPlatePicker value={refId} selected={pickedPlate} onPick={(p) => { setPickedPlate(p); setRefId(p.id); }} />
              ) : (
                <SearchSelect
                  placeholder={kind === 'category' ? 'Malzeme türü seç…' : 'Ürün türü ara/seç…'}
                  value={refId}
                  loading={kind === 'category' ? !categories : !templates}
                  options={
                    kind === 'category'
                      ? (categories ?? []).map((c) => ({ id: c.id, label: c.name }))
                      : (templates ?? []).map((t) => ({ id: t.id, label: t.name, group: t.category?.name ?? 'Diğer' }))
                  }
                  onChange={setRefId}
                />
              )}
            </Field>
            <Field label="Kimler görsün?">
              <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as StockShareVisibility)}>
                <option value="public">{VISIBILITY_LABEL.public}</option>
                <option value="partners">{VISIBILITY_LABEL.partners}</option>
              </select>
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            {visibility === 'public'
              ? 'Ticaret özelliği açık, sizi engellememiş her işletme listeyi görür.'
              : '"Stoğumu görebilir" yetkisi verdiğiniz işletmeler görür (Yetkiler sekmesi).'}
          </p>
          <Field label="Not (ops.)">
            <input className="input" maxLength={200} placeholder="Örn. Hafta içi teslim" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <button type="button" className="btn-primary" disabled={!refId || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? 'Ekleniyor…' : 'Listeye ekle'}
            </button>
          </div>
        </div>
      )}

      {isLoading && <LoadingBlock rows={2} />}
      {isError && (
        <p role="alert" className="text-sm text-red-600">
          {apiErrorMessage(error, 'Paylaşımlar alınamadı.')}
        </p>
      )}
      <ul className="space-y-2">
        {shares?.map((s: StockShare) => (
          <li key={s.id} className={`card flex flex-wrap items-center justify-between gap-3 !p-3 ${s.isActive ? '' : 'opacity-70'}`} data-share={s.label}>
            <div className="min-w-0 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.kind === 'plate' ? stripNamePlaceholders(s.label) || s.label : s.label}</span>
                <span className="badge bg-slate-100 text-slate-700">{KIND_LABEL[s.kind]}</span>
                <span className={`badge ${s.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{s.isActive ? 'Açık' : 'Kapalı'}</span>
              </p>
              <p className="text-xs text-slate-500">
                {s.itemCount} kalem listeleniyor · {VISIBILITY_LABEL[s.visibility]}
                {s.note ? ` · ${s.note}` : ''}
              </p>
            </div>
            {canWrite && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="input !w-auto"
                  aria-label="Kimler görsün?"
                  value={s.visibility}
                  disabled={patch.isPending}
                  onChange={(e) => patch.mutate({ id: s.id, p: { visibility: e.target.value as StockShareVisibility } })}
                >
                  <option value="public">{VISIBILITY_LABEL.public}</option>
                  <option value="partners">{VISIBILITY_LABEL.partners}</option>
                </select>
                <button
                  type="button"
                  className={s.isActive ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                  disabled={patch.isPending}
                  onClick={() => patch.mutate({ id: s.id, p: { isActive: !s.isActive } })}
                >
                  {s.isActive ? 'Kapat' : 'Aç'}
                </button>
                <button
                  type="button"
                  className="btn-danger-soft btn-sm"
                  disabled={remove.isPending}
                  onClick={async () => {
                    if (await confirmDialog({ message: `"${s.label}" paylaşım kuralı silinsin mi?`, confirmText: 'Sil', danger: true })) remove.mutate(s.id);
                  }}
                >
                  Sil
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!isLoading && !isError && !shares?.length && (
        <EmptyState
          icon="📣"
          title="Henüz paylaşılan stok yok."
          hint={canWrite ? 'Yukarıdan bir malzeme grubu, ürün türü ya da tek kalem seçip "Listeye ekle" deyin; diğer işletmeler "bende var" diye görür.' : 'Stok yazma izni olan biri paylaşım ekleyebilir.'}
        />
      )}
      {!canWrite && <p className="text-xs text-slate-500">Paylaşımı değiştirmek için stok yazma izniniz olmalı.</p>}
    </div>
  );
}

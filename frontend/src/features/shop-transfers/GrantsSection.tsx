import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { TransferTarget } from '../../api/shop-transfers.api';
import {
  deletePartnerGrant,
  fetchPartnerGrants,
  upsertPartnerGrant,
  type PartnerGrant,
  type PartnerPermission,
} from '../../api/trade.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { formatDate, toIsoDate } from '../../lib/format';
import { apiErrorMessage, toast } from '../../lib/toast';
import { alertBox, Field, infoBox, PartnerPicker, placeLabel, warnBox } from './shared';

const PERMISSIONS: { id: PartnerPermission; title: string; hint: string; given: string; received: string }[] = [
  {
    id: 'auto_approve',
    title: 'İşlemlerini otomatik onayla',
    hint: 'Bu işletmenin size yönelttiği satış teklifleri ve alım talepleri onayınız beklenmeden hemen tamamlanır.',
    given: 'Gönderdiği teklif ve talepler onayınız beklenmeden tamamlanır',
    received: 'Size gönderdiğiniz teklif ve talepleri onay beklemeden tamamlıyor',
  },
  {
    id: 'view_stock',
    title: 'Stoğumu görebilsin',
    hint: '"Yalnız yetki verdiklerim" olarak paylaştığınız "bende var" listesini bu işletme de görür.',
    given: 'Yalnız-yetkililere açık "bende var" listenizi görebilir',
    received: 'Yalnız-yetkililere açık "bende var" listesini sizinle paylaşıyor',
  },
  {
    id: 'block',
    title: 'Engelle',
    hint: 'Bu işletme sizi göremez, size teklif/talep gönderemez ve stoğunuzu göremez. Verdiğiniz diğer yetkiler kalkar.',
    given: 'Engelli: sizi göremez, işlem yönlendiremez',
    received: '',
  },
];

const PERM_BADGE: Record<PartnerPermission, string> = {
  auto_approve: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  view_stock: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  block: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

/** Süre seçenekleri: gün sayısı; null = süresiz, 'custom' = tarih seç. */
const DURATIONS: { id: string; label: string; days: number | null | 'custom' }[] = [
  { id: 'forever', label: 'Süresiz', days: null },
  { id: '1d', label: '1 gün', days: 1 },
  { id: '7d', label: '1 hafta', days: 7 },
  { id: '30d', label: '1 ay', days: 30 },
  { id: '90d', label: '3 ay', days: 90 },
  { id: '365d', label: '1 yıl', days: 365 },
  { id: 'custom', label: 'Tarih seç…', days: 'custom' },
];

/** Seçilen güne kadar (o günün sonu dahil) geçerli bitiş zamanı. */
function endOfDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

function expiryText(expiresAt: string | null): string {
  if (!expiresAt) return 'Süresiz';
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  const left = days <= 1 ? 'bugün bitiyor' : `${days} gün kaldı`;
  return `${formatDate(expiresAt)} tarihine kadar · ${left}`;
}

function GrantRow({ g, side, canWrite, onRemove, busy }: { g: PartnerGrant; side: 'given' | 'received'; canWrite: boolean; onRemove: () => void; busy: boolean }) {
  const meta = PERMISSIONS.find((p) => p.id === g.permission)!;
  return (
    <li className="card flex flex-wrap items-center justify-between gap-3 !p-3" data-grant={`${side}:${g.permission}`}>
      <div className="min-w-0 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{g.shop.name}</span>
          {placeLabel(g.shop) && <span className="text-xs text-slate-500">{placeLabel(g.shop)}</span>}
          <span className={`badge ${PERM_BADGE[g.permission]}`}>{meta.title}</span>
        </p>
        <p className="text-xs text-slate-500">
          {side === 'given' ? meta.given : meta.received} · {expiryText(g.expiresAt)}
          {g.note ? ` · ${g.note}` : ''}
        </p>
      </div>
      {side === 'given' && canWrite && (
        <button type="button" className="btn-danger-soft btn-sm" disabled={busy} onClick={onRemove}>
          Kaldır
        </button>
      )}
    </li>
  );
}

/**
 * İşletmeler arası yetkiler: her işletmeye ayrı ayrı "işlemlerini otomatik onayla", "stoğumu görebilsin" ya da
 * "engelle" tanımlanır; süreli (gün/tarih) ya da süresiz olabilir. Süresi dolan yetki kendiliğinden geçersiz olur.
 * Yetkileri yalnız işletme yöneticisi değiştirir; karşı işletmenin size tanıdıkları salt okunur görünür.
 */
export function GrantsSection() {
  const { shop, isShopAdmin } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['partners', 'grants', shop?.id],
    queryFn: fetchPartnerGrants,
  });

  const [partner, setPartner] = useState<TransferTarget | undefined>();
  const [permission, setPermission] = useState<PartnerPermission>('auto_approve');
  const [duration, setDuration] = useState('forever');
  const [customDate, setCustomDate] = useState('');
  const [note, setNote] = useState('');

  const today = new Date();
  const maxDate = toIsoDate(new Date(today.getFullYear() + 5, today.getMonth(), today.getDate() - 1));
  const minDate = toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));

  const dur = DURATIONS.find((d) => d.id === duration)!;
  const expiresAt: string | null | undefined =
    dur.days === null
      ? null
      : dur.days === 'custom'
        ? customDate
          ? endOfDayIso(customDate)
          : undefined
        : new Date(Date.now() + dur.days * 86_400_000).toISOString();
  const canSubmit = !!partner && expiresAt !== undefined && isShopAdmin;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['partners'] });
    qc.invalidateQueries({ queryKey: ['marketplace'] });
  };
  const save = useMutation({
    mutationFn: () => upsertPartnerGrant({ granteeShopId: partner!.id, permission, expiresAt: expiresAt ?? null, note: note.trim() || null }),
    onSuccess: (g) => {
      toast.success('Yetki kaydedildi', `${g.shop.name}: ${PERMISSIONS.find((p) => p.id === g.permission)!.title} · ${expiryText(g.expiresAt)}`);
      setPartner(undefined);
      setNote('');
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deletePartnerGrant(id),
    onSuccess: () => toast.success('Yetki kaldırıldı'),
    onError: (e) => toast.error(apiErrorMessage(e, 'Kaldırılamadı.')),
    onSettled: refresh,
  });

  const given = data?.given ?? [];
  const received = data?.received ?? [];

  return (
    <div className="space-y-4">
      <p className={infoBox}>
        Varsayılan olarak her teklif ve talep karşı işletmenin onayını bekler. Güvendiğiniz işletmelere otomatik onay verebilir,
        stoğunuzu görmelerine izin verebilir ya da dilediğinizi engelleyebilirsiniz. Her yetki süreli ya da süresiz olabilir.
      </p>

      {isShopAdmin ? (
        <div className="card space-y-3">
          <h2 className="font-semibold">Yetki ver</h2>
          {save.isError && (
            <p role="alert" className={alertBox}>
              {apiErrorMessage(save.error, 'Yetki kaydedilemedi.')}
            </p>
          )}
          <Field label="İşletme *">
            <PartnerPicker value={partner?.id ?? ''} selected={partner} onPick={setPartner} accept={(t) => !t.own} placeholder="Yetki vereceğiniz işletmeyi ara/seç…" />
          </Field>
          <fieldset className="space-y-2">
            <legend className="label">Yetki</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PERMISSIONS.map((p) => (
                <label
                  key={p.id}
                  className={`cursor-pointer rounded-xl border p-3 text-sm ${permission === p.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <input type="radio" name="grant-permission" className="sr-only" checked={permission === p.id} onChange={() => setPermission(p.id)} />
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-xs text-slate-500">{p.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Ne kadar süreyle?">
              <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {DURATIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            {dur.days === 'custom' && (
              <Field label="Son gün">
                <input className="input" type="date" min={minDate} max={maxDate} value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
              </Field>
            )}
            <Field label="Not (ops.)" className={dur.days === 'custom' ? '' : 'sm:col-span-2'}>
              <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. Sezon boyunca" />
            </Field>
          </div>
          {permission === 'auto_approve' && (
            <p className={warnBox}>
              Dikkat: otomatik onay verdiğiniz işletme, sizin stoğunuzdan alım talebi gönderdiğinde ya da size teklif yolladığında
              hiçbir onay sorulmadan stok ve cari kaydı oluşur. Yalnız güvendiğiniz işletmelere ve gerekirse süreli verin.
            </p>
          )}
          {permission === 'block' && (
            <p className={warnBox}>
              Engellediğiniz işletmeye bildirim gitmez; sizi aramalarda bulamaz ve işlem yönlendiremez. Verdiğiniz diğer yetkiler kalkar.
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              className={permission === 'block' ? 'btn-danger' : 'btn-primary'}
              disabled={!canSubmit || save.isPending}
              onClick={async () => {
                if (permission === 'block' && !(await confirmDialog({ message: `"${partner!.name}" engellensin mi?`, confirmText: 'Engelle', danger: true }))) return;
                save.mutate();
              }}
            >
              {save.isPending ? 'Kaydediliyor…' : permission === 'block' ? 'Engelle' : 'Yetkiyi ver'}
            </button>
          </div>
        </div>
      ) : (
        <p className={warnBox}>Yetkileri yalnız işletme yöneticisi değiştirebilir. Aşağıda mevcut yetkileri görebilirsiniz.</p>
      )}

      {isLoading && <LoadingBlock rows={2} />}
      {isError && (
        <p role="alert" className="text-sm text-red-600">
          {apiErrorMessage(error, 'Yetkiler alınamadı.')}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">Verdiğim yetkiler</h2>
        <ul className="space-y-2">
          {given.map((g) => (
            <GrantRow
              key={g.id}
              g={g}
              side="given"
              canWrite={isShopAdmin}
              busy={remove.isPending}
              onRemove={async () => {
                if (await confirmDialog({ message: `"${g.shop.name}" için "${PERMISSIONS.find((p) => p.id === g.permission)!.title}" yetkisi kaldırılsın mı?`, confirmText: 'Kaldır', danger: true })) remove.mutate(g.id);
              }}
            />
          ))}
        </ul>
        {!isLoading && !isError && given.length === 0 && <EmptyState compact icon="🤝" title="Henüz kimseye yetki vermediniz." hint="Tüm teklif ve talepler onayınızı bekler." />}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-600">Bana tanınan yetkiler</h2>
        <ul className="space-y-2">
          {received.map((g) => (
            <GrantRow key={g.id} g={g} side="received" canWrite={false} busy={false} onRemove={() => undefined} />
          ))}
        </ul>
        {!isLoading && !isError && received.length === 0 && <EmptyState compact icon="📭" title="Size yetki tanıyan işletme yok." />}
      </section>
    </div>
  );
}

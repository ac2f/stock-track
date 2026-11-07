import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCacheStatus, fetchPlatformSettings, flushCache, updatePlatformSettings } from '../../api/platform.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { apiErrorMessage, toast } from '../../lib/toast';

/** Kayıt kuralları (açık mı, onay gerekir mi, deneme süresi) ve önbellek (Redis) durumu. */
export function PlatformSettingsTab() {
  return (
    <div className="space-y-4">
      <RegistrationCard />
      <CacheCard />
    </div>
  );
}

function RegistrationCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['platform', 'settings'], queryFn: fetchPlatformSettings });
  const [trial, setTrial] = useState('14');
  useEffect(() => {
    if (data) setTrial(String(data.trialDays));
  }, [data]);
  const save = useMutation({
    mutationFn: updatePlatformSettings,
    onSuccess: (s) => {
      qc.setQueryData(['platform', 'settings'], s);
      qc.invalidateQueries({ queryKey: ['registration-options'] });
      toast.success('Kaydedildi');
    },
    onError: (e) => toast.error('Kaydedilemedi', apiErrorMessage(e)),
  });
  if (!data) return <LoadingBlock rows={2} />;
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold">İşletme kaydı</h2>
        <p className="text-xs text-slate-500">
          Kayıt formu: <code>/register</code>. Her yeni işletme kendi boş sistemiyle başlar.
        </p>
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={data.registrationOpen} disabled={save.isPending} onChange={(e) => save.mutate({ registrationOpen: e.target.checked })} />
        <span>
          <span className="block text-sm font-medium">Herkese açık kayıt açık</span>
          <span className="block text-xs text-slate-500">Kapalıyken form çalışmaz; işletme eklemek sizin elinizdedir.</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={data.registrationAutoApprove} disabled={save.isPending} onChange={(e) => save.mutate({ registrationAutoApprove: e.target.checked })} />
        <span>
          <span className="block text-sm font-medium">Kayıtları otomatik onayla</span>
          <span className="block text-xs text-slate-500">Kapalıyken her yeni işletme "Onay bekliyor" olur ve siz onaylayana kadar giremez.</span>
        </span>
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label">Deneme süresi (gün; 0 = süresiz)</span>
          <input className="input !w-32" type="number" min={0} max={3650} value={trial} onChange={(e) => setTrial(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={save.isPending || Number(trial) === data.trialDays || trial === ''} onClick={() => save.mutate({ trialDays: Number(trial) })}>
          {save.isPending && <Spinner />} Kaydet
        </button>
      </div>
    </section>
  );
}

function CacheCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['platform', 'cache'], queryFn: fetchCacheStatus, refetchInterval: 15_000 });
  const flush = useMutation({
    mutationFn: flushCache,
    onSuccess: (r) => {
      toast.success('Önbellek temizlendi', `${r.removed} grup silindi.`);
      qc.invalidateQueries({ queryKey: ['platform', 'cache'] });
    },
    onError: (e) => toast.error('Temizlenemedi', apiErrorMessage(e)),
  });
  if (isLoading || !data) return <LoadingBlock rows={2} />;
  const modeText = data.mode === 'redis' ? (data.ready ? 'Redis — bağlı' : 'Redis — BAĞLANTI YOK (veritabanından okunuyor)') : data.mode === 'memory' ? 'Süreç içi bellek (Redis yok)' : 'Kapalı';
  const tone = data.mode === 'redis' && !data.ready ? 'text-red-700' : data.mode === 'redis' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300';
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Önbellek</h2>
          <p className={`text-sm font-medium ${tone}`}>{modeText}</p>
        </div>
        <button
          className="btn-secondary btn-sm"
          disabled={flush.isPending}
          onClick={async () => {
            if (await confirmDialog({ title: 'Önbellek temizlensin mi?', message: 'Veri silinmez; yalnız ilk okumalar bir an yavaşlar.', confirmText: 'Temizle' })) flush.mutate();
          }}
        >
          {flush.isPending && <Spinner />} Önbelleği temizle
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="İsabet oranı" value={data.hitRatio === null ? '—' : `%${data.hitRatio}`} />
        <Stat label="İsabet / ıska" value={`${data.hits} / ${data.misses}`} />
        <Stat label="Otomatik silme" value={String(data.invalidations)} />
        <Stat label="Hata" value={String(data.errors)} warn={data.errors > 0} />
      </dl>
      {data.flushPending && <p className="text-xs font-medium text-amber-700">Redis kapalıyken değişiklik oldu: bağlantı gelince önbellek baştan kurulacak.</p>}
      {data.redis && (
        <p className="text-xs text-slate-500">
          Redis belleği: {data.redis.used_memory_human} · en çok {data.redis.maxmemory_human === '0B' ? 'sınırsız' : data.redis.maxmemory_human} · {data.redis.maxmemory_policy} · {data.redis.keys} anahtar
        </p>
      )}
      {Object.keys(data.byGroup).length > 0 && (
        <details className="text-xs text-slate-600 dark:text-slate-300">
          <summary className="cursor-pointer font-medium">Gruplara göre</summary>
          <ul className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {Object.entries(data.byGroup).map(([g, v]) => (
              <li key={g}>
                <b>{g}</b>: {v.hits} isabet, {v.misses} ıska
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-lg font-semibold ${warn ? 'text-red-600' : ''}`}>{value}</dd>
    </div>
  );
}

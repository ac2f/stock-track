import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  discardOutbox,
  fetchOutbox,
  retryOutbox,
  type OutboxItem,
  type OutboxState,
} from '../../api/system.api';
import { confirmDialog } from '../../components/ConfirmDialog';
import { Pagination } from '../../components/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useSyncStatus, useSystemInfo } from '../../hooks/useSystemInfo';
import { formatDateTime } from '../../lib/format';
import { apiErrorMessage, toast } from '../../lib/toast';

/** Giden kutusundaki işlemin okunur adı: "Satış", "Tahsilat" ... */
const LABELS: [RegExp, string][] = [
  [/^POST \/v1\/sales/, 'Satış'],
  [/^POST \/v1\/customers\/[^/]+\/payments/, 'Tahsilat / ödeme'],
  [/^POST \/v1\/customers\/[^/]+\/(discount|settle)/, 'İndirim / borç kapatma'],
  [/^POST \/v1\/customers$/, 'Yeni müşteri'],
  [/^PATCH \/v1\/customers/, 'Müşteri düzenleme'],
  [/^POST \/v1\/quotes\/[^/]+\/convert/, 'Teklif → satış/iş'],
  [/^POST \/v1\/quotes$/, 'Yeni teklif'],
  [/\/v1\/quotes/, 'Teklif'],
  [/\/v1\/processing/, 'İş kuyruğu'],
  [/\/v1\/purchases/, 'Satın alma'],
  [/\/v1\/expenses/, 'Gider'],
  [/\/v1\/plates/, 'Stok'],
  [/\/v1\/corel\/jobs\/[^/]+\/folders/, 'Runner klasör bildirimi'],
  [/\/v1\/settings/, 'Dükkân ayarı'],
];
function labelOf(o: OutboxItem): string {
  const key = `${o.method} ${o.path.split('?')[0]}`;
  return LABELS.find(([re]) => re.test(key))?.[1] ?? key;
}

const STATE_LABEL: Record<OutboxState, string> = {
  pending: 'Gönderilecek',
  pushing: 'Gönderiliyor',
  applied: 'Merkezde',
  rejected: 'Reddedildi',
  discarded: 'Vazgeçildi',
  uncertain: 'Belirsiz',
};

const TABS: { id: OutboxState | 'open'; label: string }[] = [
  { id: 'open', label: 'Karar bekleyen' },
  { id: 'pending', label: 'Gönderilecek' },
  { id: 'applied', label: 'Merkezde' },
  { id: 'discarded', label: 'Vazgeçilen' },
];

function OutboxRow({ o }: { o: OutboxItem }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const done = () => {
    qc.invalidateQueries({ queryKey: ['system'] });
  };
  const retry = useMutation({
    mutationFn: () => retryOutbox(o.id),
    onSuccess: () => toast.success('Yeniden gönderilecek'),
    onError: (e) => toast.error(apiErrorMessage(e, 'Yapılamadı.')),
    onSettled: done,
  });
  const discard = useMutation({
    mutationFn: () => discardOutbox(o.id),
    onSuccess: () => toast.success('Vazgeçildi', 'Yereldeki etkisi eşitlemede geri alınır.'),
    onError: (e) => toast.error(apiErrorMessage(e, 'Yapılamadı.')),
    onSettled: done,
  });
  const decidable = o.state === 'rejected' || o.state === 'uncertain';
  return (
    <div className="card space-y-2 !p-3" data-outbox={o.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{labelOf(o)}</p>
          <p className="text-xs text-slate-500">
            {formatDateTime(o.occurred_at)}
            {o.user_name ? ` · ${o.user_name}` : o.actor === 'corel' ? ' · Corel/runner' : ''}
            {o.shop_name ? ` · ${o.shop_name}` : ''}
          </p>
        </div>
        <span
          className={`badge ${
            o.state === 'rejected' || o.state === 'uncertain'
              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
              : o.state === 'applied'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-slate-100 text-slate-700'
          }`}
        >
          {STATE_LABEL[o.state]}
        </span>
      </div>
      {o.error && <p className="rounded-lg bg-red-50 px-2 py-1 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{o.error}</p>}
      <button type="button" className="text-xs text-slate-500 underline" onClick={() => setOpen((v) => !v)}>
        {open ? 'Ayrıntıyı gizle' : 'Ayrıntı'}
      </button>
      {open && (
        <pre className="max-h-60 overflow-auto rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-900">
          {o.method} {o.path}
          {'\n'}
          {JSON.stringify(o.body, null, 2)}
        </pre>
      )}
      {decidable && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" disabled={retry.isPending} onClick={() => retry.mutate()}>
            Yeniden dene
          </button>
          <button
            className="btn-danger-soft btn-sm"
            disabled={discard.isPending}
            onClick={async () => {
              if (
                await confirmDialog({
                  message: `"${labelOf(o)}" işleminden vazgeçilsin mi? Merkeze gönderilmez; yerelde yaptığı değişiklik (stok, cari ...) eşitlemede geri alınır.`,
                  confirmText: 'Vazgeç',
                  danger: true,
                })
              )
                discard.mutate();
            }}
          >
            Vazgeç
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 🖥️ Eşitleme: dükkândaki yerel sunucunun merkezle durumu ve giden kutusu.
 * Merkezin reddettiği (ör. stok o arada başka yerde satılmış) ya da yerel
 * sunucu kapanırken yarım kalan işlemler için karar burada verilir.
 */
export function SyncPage() {
  const { isOwner } = useAuth();
  const { data: info } = useSystemInfo();
  const replica = info?.role === 'replica';
  const { data: s } = useSyncStatus(replica);
  const [tab, setTab] = useState<OutboxState | 'open'>('open');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['system', 'outbox', tab, page],
    queryFn: () => fetchOutbox({ state: tab, page, limit: 20 }),
    enabled: replica,
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  if (info && !replica) {
    return (
      <div className="space-y-4">
        <PageHeader title="Eşitleme" icon="🖥️" subtitle="Bu sunucu merkez sunucudur." />
        <EmptyState
          icon="🏢"
          title="Merkez sunucuya bağlısınız"
          hint="Dükkândaki yerel sunucular (çevrimdışı çalışma) Ayarlar › Yerel sunucular bölümünden eklenir."
          action={
            isOwner ? (
              <Link className="btn-secondary" to="/settings#ayar-yerel-sunucu">
                Yerel sunuculara git
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Eşitleme"
        icon="🖥️"
        subtitle="Bu arayüz dükkândaki yerel sunucuya bağlı. İnternet ya da merkez sunucu giderse burada çalışmaya devam edilir; bağlantı gelince işlemler merkeze gönderilir."
      />
      {s && (
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="card !p-3">
            <p className="text-xs text-slate-500">Merkez</p>
            <p className="font-semibold">{s.upstreamReachable ? '🟢 Bağlı' : '🟠 Ulaşılamıyor'}</p>
            <p className="text-xs text-slate-500">{s.lastContactAt ? formatDateTime(s.lastContactAt) : '—'}</p>
          </div>
          <div className="card !p-3">
            <p className="text-xs text-slate-500">Eşitleme programı</p>
            <p className="font-semibold">{s.agentRunning ? '🟢 Çalışıyor' : '🔴 Çalışmıyor'}</p>
            <p className="text-xs text-slate-500">Son çekme: {s.lastPullAt ? formatDateTime(s.lastPullAt) : '—'}</p>
          </div>
          <div className="card !p-3">
            <p className="text-xs text-slate-500">Gönderilecek</p>
            <p className="text-xl font-bold tabular-nums">{s.outbox?.pending ?? 0}</p>
            <p className="text-xs text-slate-500">Bugün gönderilen: {s.outbox?.appliedToday ?? 0}</p>
          </div>
          <div className="card !p-3">
            <p className="text-xs text-slate-500">Karar bekleyen</p>
            <p className={`text-xl font-bold tabular-nums ${(s.outbox?.rejected ?? 0) + (s.outbox?.uncertain ?? 0) ? 'text-red-600' : ''}`}>
              {(s.outbox?.rejected ?? 0) + (s.outbox?.uncertain ?? 0)}
            </p>
            <p className="text-xs text-slate-500">Reddedilen / belirsiz</p>
          </div>
        </div>
      )}
      {s?.lastError && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          Son hata: {s.lastError}
        </p>
      )}
      <div className="flex flex-wrap gap-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
            onClick={() => {
              setTab(t.id);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {isLoading && <LoadingBlock rows={2} />}
      {data?.items.map((o) => <OutboxRow key={o.id} o={o} />)}
      {data?.meta && data.meta.total > 0 && (
        <Pagination
          page={data.meta.page}
          pageCount={data.meta.pageCount}
          total={data.meta.total}
          pageSize={20}
          onPage={setPage}
          onPageSize={() => undefined}
        />
      )}
      {!isLoading && !data?.items.length && (
        <EmptyState
          compact
          icon={tab === 'open' ? '✅' : '📭'}
          title={tab === 'open' ? 'Karar bekleyen işlem yok.' : 'Bu listede işlem yok.'}
        />
      )}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { deleteCorelRunner, fetchCorelRunners, type CorelRunnerStatus } from '../api/corel-runners.api';
import { formatDateTime } from '../lib/format';
import { confirmDialog } from './ConfirmDialog';

/** "12 sn önce", "3 dk önce", "2 saat önce", "4 gün önce". */
export function agoText(seconds: number): string {
  if (seconds < 60) return `${seconds} sn önce`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk önce`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} saat önce`;
  return `${Math.floor(seconds / 86400)} gün önce`;
}

/** Runner durumu; 15 sn'de bir tazelenir (sekme açıkken). `enabled: false` → hiç istenmez. */
export function useRunners(enabled = true) {
  return useQuery({
    queryKey: ['corel-runners'],
    queryFn: fetchCorelRunners,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
    enabled,
  });
}

type Tone = 'ok' | 'warn' | 'off' | 'none';

export function runnerSummary(runners: CorelRunnerStatus[] | undefined): {
  tone: Tone;
  text: string;
} {
  if (!runners) return { tone: 'none', text: 'Runner durumu…' };
  if (!runners.length) return { tone: 'none', text: 'Runner kurulmadı' };
  const online = runners.filter((r) => r.online);
  if (online.some((r) => !r.lastError)) {
    const r = online.find((x) => !x.lastError)!;
    return { tone: 'ok', text: `Runner bağlı · ${r.host}` };
  }
  if (online.length) return { tone: 'warn', text: `Runner bağlı ama sorun var · ${online[0].host}` };
  return { tone: 'off', text: `Runner bağlı değil · son nabız ${agoText(runners[0].secondsAgo)}` };
}

const TONE_CLS: Record<Tone, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  off: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
  none: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};
const DOT_CLS: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  off: 'bg-red-500',
  none: 'bg-slate-400',
};

/**
 * Teklif ekranının başlığındaki küçük rozet: dükkân bilgisayarındaki runner
 * bağlı mı. Dokununca Ayarlar › Corel entegrasyonu'ndaki ayrıntıya gider.
 */
export function RunnerBadge() {
  const { data } = useRunners();
  const s = runnerSummary(data);
  return (
    <Link
      to="/settings#ayar-corel"
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${TONE_CLS[s.tone]}`}
      title="Teklif işe dönünce klasörleri dükkân bilgisayarındaki runner açar. Ayrıntı: Ayarlar › Corel entegrasyonu"
    >
      <span className={`h-2 w-2 rounded-full ${DOT_CLS[s.tone]}`} aria-hidden />
      📁 {s.text}
    </Link>
  );
}

/** Ayarlar › Corel entegrasyonu: her bilgisayarın ayrıntılı durumu. */
export function RunnerPanel({ canManage, active = true }: { canManage: boolean; active?: boolean }) {
  const qc = useQueryClient();
  // Kart ekranda değilken 15 sn'lik yoklama yapılmaz.
  const { data, isPending: isLoading, isError } = useRunners(active);
  const del = useMutation({
    mutationFn: deleteCorelRunner,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['corel-runners'] }),
  });

  if (isLoading) return <p className="text-xs text-slate-500">Runner durumu okunuyor…</p>;
  if (isError) return <p className="text-xs text-red-600">Runner durumu okunamadı.</p>;

  if (!data?.length) {
    return (
      <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
        <p className="font-semibold text-slate-700 dark:text-slate-200">Henüz hiçbir bilgisayar bağlanmadı.</p>
        <p>
          Runner kurulu değil, çalışmıyor ya da bu anahtarla bağlanamıyor. Dükkân bilgisayarında
          stock-track-runner klasöründeki <b>install.bat</b>'ı çalıştırın; kurulum sonunda açılan
          “StockTrack Runner Durumu” penceresi sorunu söyler. Runner bağlanınca burada yeşil görünür.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((r) => {
        const tone: Tone = !r.online ? 'off' : r.lastError ? 'warn' : 'ok';
        return (
          <li key={r.id} className="space-y-1 rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${DOT_CLS[tone]}`} aria-hidden />
              <span className="text-sm font-semibold">{r.host}</span>
              <span className={`badge ${TONE_CLS[tone]}`}>
                {tone === 'ok' ? 'Bağlı' : tone === 'warn' ? 'Bağlı, sorun var' : 'Bağlantı yok'}
              </span>
              <span className="text-slate-500">son nabız {agoText(r.secondsAgo)}</span>
              {r.version && <span className="text-slate-400">· sürüm {r.version}</span>}
              {canManage && !r.online && (
                <button
                  className="ml-auto text-slate-400 underline hover:text-red-600"
                  disabled={del.isPending}
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        message: `${r.host} listeden kaldırılsın mı? Runner yeniden bağlanırsa tekrar görünür.`,
                        confirmText: 'Kaldır',
                      })
                    )
                      del.mutate(r.id);
                  }}
                >
                  listeden kaldır
                </button>
              )}
            </div>
            <p className="break-all text-slate-600 dark:text-slate-300">
              <span className="font-medium">Gün klasörü:</span> {r.dayRoot ?? 'bilinmiyor'}
              {r.dayRootSource && <span className="text-slate-400"> (kaynak: {r.dayRootSource})</span>}
            </p>
            {r.lastJobQuoteNo && (
              <p className="break-all text-slate-600 dark:text-slate-300">
                <span className="font-medium">Son açılan:</span> {r.lastJobQuoteNo} ·{' '}
                {r.lastJobAt && formatDateTime(r.lastJobAt)} · {r.lastFolder}
              </p>
            )}
            {r.lastError && (
              <p className="rounded bg-red-50 px-2 py-1 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <span className="font-semibold">Sorun:</span> {r.lastError}
              </p>
            )}
            {!r.online && (
              <p className="text-amber-700 dark:text-amber-400">
                Bu bilgisayar {agoText(r.secondsAgo)} bağlandı. Kapalı olabilir ya da runner durmuş olabilir:
                masaüstündeki “StockTrack Runner Durumu”ndan <b>Başlat</b>'a basın.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Klasör yolunun son iki parçası (gün › müşteri) — kartta kısa görünsün. */
function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join(' › ') || path;
}

/** İşe dönmüş, klasörü henüz bildirilmemiş ve yakın zamanda dönmüş/istenmiş mi. */
export function folderPending(q: {
  status: string;
  convertedAt?: string | null;
  foldersCreatedAt?: string | null;
  foldersRequestedAt?: string | null;
}): boolean {
  if (q.status !== 'converted') return false;
  const requested = q.foldersRequestedAt && (!q.foldersCreatedAt || q.foldersCreatedAt < q.foldersRequestedAt);
  if (q.foldersCreatedAt && !requested) return false;
  const since = requested ? q.foldersRequestedAt : q.convertedAt;
  return !!since && Date.now() - new Date(since).getTime() < 5 * 60_000;
}

/**
 * Teklif kartındaki klasör satırı. İşe dönmüş teklifte: açıldı (nerede,
 * hangi bilgisayar) / bekleniyor / açılmadı + neden + "yeniden iste".
 * Henüz dönmemiş teklifte klasörün ne zaman açılacağını söyler.
 */
export function QuoteFolders({
  quote,
  runners,
  canRequest,
  requesting,
  onRequest,
  compact = false,
}: {
  quote: {
    status: string;
    convertedAt?: string | null;
    foldersCreatedAt?: string | null;
    foldersPath?: string | null;
    foldersHost?: string | null;
    foldersNote?: string | null;
    foldersRequestedAt?: string | null;
  };
  runners: CorelRunnerStatus[] | undefined;
  canRequest: boolean;
  requesting: boolean;
  onRequest: () => void;
  compact?: boolean;
}) {
  const summary = runnerSummary(runners);
  if (quote.status !== 'converted') {
    if (compact || quote.status === 'rejected') return null;
    return (
      <p className="text-[11px] text-slate-400">
        📁 Müşteri ve ürün klasörleri teklif <b>işe dönüştürülünce</b> dükkân bilgisayarında açılır.
      </p>
    );
  }
  const requested =
    !!quote.foldersRequestedAt &&
    (!quote.foldersCreatedAt || quote.foldersCreatedAt < quote.foldersRequestedAt);
  const requestBtn = canRequest && (
    <button type="button" className="font-semibold underline" disabled={requesting} onClick={onRequest}>
      {requesting ? 'İsteniyor…' : 'Klasörleri yeniden iste'}
    </button>
  );

  if (quote.foldersCreatedAt && !requested) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
        <span title={quote.foldersPath ?? undefined}>
          📁 Klasörler açıldı{quote.foldersPath ? `: ${shortPath(quote.foldersPath)}` : ''}
          <span className="text-slate-400">
            {' '}
            · {quote.foldersHost} · {formatDateTime(quote.foldersCreatedAt)}
          </span>
        </span>
        {quote.foldersNote && (
          <span className="text-amber-700 dark:text-amber-400" title={quote.foldersNote}>
            ⚠ {quote.foldersNote.split('\n')[0]}
          </span>
        )}
        {!compact && <span className="text-slate-400">{requestBtn}</span>}
      </div>
    );
  }

  if (folderPending(quote) && summary.tone === 'ok') {
    return (
      <p className="text-[11px] text-slate-500">
        📁 Klasörler açılıyor… (dükkân bilgisayarı en geç ~30 sn içinde açar)
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
      <span>
        📁 Klasörler henüz açılmadı
        {summary.tone === 'off' || summary.tone === 'none'
          ? ` — ${summary.text.toLowerCase().startsWith('runner') ? summary.text : 'runner bağlı değil'}.`
          : summary.tone === 'warn'
            ? ' — runner bir sorun bildiriyor (Ayarlar › Corel entegrasyonu).'
            : requested
              ? ' — istendi, bekleniyor.'
              : '.'}
      </span>
      {requestBtn}
      {(summary.tone !== 'ok') && (
        <Link to="/settings#ayar-corel" className="underline">
          ayrıntı
        </Link>
      )}
    </div>
  );
}

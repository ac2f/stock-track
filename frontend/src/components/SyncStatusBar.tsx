import { Link } from 'react-router-dom';
import { useSyncStatus, useSystemInfo } from '../hooks/useSystemInfo';
import { formatDateTime } from '../lib/format';

/**
 * Yerel sunucu (replika) şeridi: arayüz dükkândaki yerel sunucuya bağlıysa
 * her zaman görünür — merkezle bağlantı, gönderilmeyi bekleyen işlemler ve
 * kişinin karar vermesi gereken (merkezin reddettiği) işlemler. Merkez
 * sunucuya bağlıyken hiç görünmez.
 */
export function SyncStatusBar() {
  const { data: info } = useSystemInfo();
  const replica = info?.role === 'replica';
  const { data: s } = useSyncStatus(replica);
  if (!replica || !s) return null;

  const decide = (s.outbox?.rejected ?? 0) + (s.outbox?.uncertain ?? 0);
  const pending = s.outbox?.pending ?? 0;
  const linked = s.agentRunning && s.upstreamReachable;

  let tone = 'border-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-900/60';
  let main: string;
  if (decide > 0) {
    tone = 'border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100';
    main = `${decide} işlem merkezde işlenemedi — karar vermeniz gerekiyor.`;
  } else if (!s.agentRunning) {
    tone = 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100';
    main = 'Eşitleme programı çalışmıyor — kayıtlar yerelde tutuluyor.';
  } else if (!s.upstreamReachable) {
    tone = 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100';
    main = `Merkeze ulaşılamıyor — yerelde çalışılıyor${pending ? `; ${pending} işlem bağlantı gelince gönderilecek` : ''}.`;
  } else if (pending > 0) {
    tone = 'border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-100';
    main = `Merkezle eşitleniyor — ${pending} işlem gönderilecek.`;
  } else {
    main = 'Merkezle eşit.';
  }
  const last = s.lastContactAt ? `son bağlantı ${formatDateTime(s.lastContactAt)}` : 'merkeze henüz bağlanmadı';

  return (
    <Link
      to="/sync"
      className={`no-print flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 border-b px-3 py-1.5 text-left text-xs sm:px-4 sm:text-sm ${tone}`}
      title="Eşitleme durumu ve bekleyen işlemler"
      data-sync-bar
    >
      <span className="font-semibold">🖥️ Yerel sunucu</span>
      <span aria-hidden>·</span>
      <span>{linked ? '🟢' : '🟠'} {main}</span>
      <span className="opacity-70">({last})</span>
    </Link>
  );
}

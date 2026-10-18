import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  fetchPortalDocuments,
  fetchPortalLedger,
  fetchPortalSummary,
  PortalError,
} from '../../api/portal.api';
import { formatDate, formatMoney } from '../../lib/format';

/**
 * Müşteri self-servis portalı (PUBLIC). Giriş gerektirmez; tahmin edilemez
 * token'lı bağlantı ile açılır. Salt-okunur: bakiye + son hareketler + belgeler.
 * Telefonda açılması beklenir: önce bakiye, hareketler kart listesi; geniş
 * ekranda hareketler tablo olarak görünür.
 */
export function PortalPage() {
  const { token = '' } = useParams();
  const summaryQ = useQuery({
    queryKey: ['portal', token],
    queryFn: () => fetchPortalSummary(token),
    retry: false,
  });
  const ledgerQ = useQuery({
    queryKey: ['portal', token, 'ledger'],
    queryFn: () => fetchPortalLedger(token),
    enabled: summaryQ.isSuccess,
    retry: false,
  });
  const docsQ = useQuery({
    queryKey: ['portal', token, 'docs'],
    queryFn: () => fetchPortalDocuments(token),
    enabled: summaryQ.isSuccess,
    retry: false,
  });

  if (summaryQ.isError) {
    // Token gerçekten geçersizse farklı; API'ye ulaşılamıyorsa farklı mesaj.
    const err = summaryQ.error;
    const isInvalid = err instanceof PortalError && err.code === 'invalid';
    return (
      <Shell>
        <div className="card px-5 py-8 text-center">
          <div className="text-4xl" aria-hidden>
            {isInvalid ? '🔒' : '📡'}
          </div>
          {isInvalid ? (
            <>
              <p className="mt-3 font-semibold text-slate-800">Bağlantı geçersiz veya iptal edilmiş.</p>
              <p className="mt-1 text-sm text-slate-500">
                Güncel bağlantıyı sizinle paylaşan işletmeden isteyebilirsiniz.
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-semibold text-slate-800">Şu an bağlanılamıyor.</p>
              <p className="mt-1 text-sm text-slate-500">
                Lütfen birazdan tekrar deneyin. Sorun sürerse bağlantıyı
                paylaşan işletmeyle iletişime geçin.
              </p>
              <button className="btn-secondary mt-4" onClick={() => summaryQ.refetch()}>
                Tekrar dene
              </button>
            </>
          )}
        </div>
      </Shell>
    );
  }
  if (!summaryQ.data) {
    return (
      <Shell>
        <div className="space-y-3" role="status" aria-label="Yükleniyor…">
          <div className="card space-y-3">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-9 w-1/2" />
          </div>
          <div className="card space-y-2">
            <div className="skeleton h-4 w-1/4" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-5/6" />
            <div className="skeleton h-3 w-2/3" />
          </div>
          <span className="sr-only">Yükleniyor…</span>
        </div>
      </Shell>
    );
  }

  const s = summaryQ.data;
  const money = { format: (n: number) => formatMoney(n, s.currency) };
  const owes = s.currentBalance > 0;
  const ledger = ledgerQ.data ?? [];
  const docs = docsQ.data;
  const hasDocs = !!docs && (docs.sales.length > 0 || docs.processing.length > 0);

  return (
    <Shell brand={s.businessName}>
      {/* Bakiye: sayfanın en önemli bilgisi, en üstte ve büyük. */}
      <div
        className={`card border-l-4 ${
          owes ? 'border-l-red-500' : 'border-l-emerald-500'
        }`}
      >
        <p className="break-words text-base font-semibold text-slate-800">
          {s.companyName ?? s.name}
        </p>
        {s.companyName && s.name && s.companyName !== s.name && (
          <p className="text-xs text-slate-500">{s.name}</p>
        )}
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Güncel bakiye</p>
        <p
          className={`mt-0.5 text-4xl font-bold leading-tight tabular-nums [overflow-wrap:anywhere] ${
            owes ? 'text-red-600' : 'text-emerald-600'
          }`}
        >
          {money.format(s.currentBalance)}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {owes ? 'Bu tutar tarafımıza borcunuzu gösterir.' : 'Ödenmemiş borcunuz bulunmuyor.'}
        </p>
      </div>

      <div className="card !px-0 !pb-1">
        <div className="flex items-baseline justify-between gap-2 px-4">
          <h2 className="font-semibold">Son Hareketler</h2>
          {ledger.length > 0 && <span className="text-xs text-slate-500">{ledger.length} hareket</span>}
        </div>

        {ledgerQ.isLoading ? (
          <div className="space-y-2 px-4 py-3" role="status" aria-label="Yükleniyor…">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : !ledger.length ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Hareket yok.</p>
        ) : (
          <>
            {/* Telefon: kart listesi */}
            <ul className="mt-2 divide-y divide-slate-100 sm:hidden">
              {ledger.map((e, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-slate-800">
                      {e.description ?? e.sourceType}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">{formatDate(e.date)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        e.type === 'credit' ? 'text-emerald-600' : 'text-slate-900'
                      }`}
                    >
                      {money.format(e.amount)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {e.type === 'credit' ? 'Alacak' : 'Borç'} · bakiye{' '}
                      <span className="tabular-nums">{money.format(e.balanceAfter)}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {/* Geniş ekran: tablo */}
            <div className="hidden overflow-x-auto px-4 sm:block">
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-2 pr-2 font-medium">Tarih</th>
                    <th className="px-2 py-2 font-medium">Açıklama</th>
                    <th className="px-2 py-2 text-right font-medium">Borç</th>
                    <th className="px-2 py-2 text-right font-medium">Alacak</th>
                    <th className="py-2 pl-2 text-right font-medium">Bakiye</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {ledger.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="whitespace-nowrap py-2 pr-2 text-slate-600">{formatDate(e.date)}</td>
                      <td className="px-2 py-2">{e.description ?? e.sourceType}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {e.type === 'debit' ? money.format(e.amount) : ''}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-emerald-600">
                        {e.type === 'credit' ? money.format(e.amount) : ''}
                      </td>
                      <td className="whitespace-nowrap py-2 pl-2 text-right font-medium">
                        {money.format(e.balanceAfter)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {docs && hasDocs && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Belgeler</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {docs.sales.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="badge bg-blue-100 text-blue-800">Satış</span>
                  <span className="text-slate-600 tabular-nums">{formatDate(d.date)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money.format(d.total)}</span>
              </li>
            ))}
            {docs.processing.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="badge bg-violet-100 text-violet-800">İşleme</span>
                    <span className="text-slate-600 tabular-nums">{formatDate(d.date)}</span>
                  </span>
                  {d.item && <span className="mt-0.5 block break-words text-xs text-slate-500">{d.item}</span>}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money.format(d.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="no-print flex flex-col items-center gap-2 pt-1 text-center">
        <button className="btn-secondary btn-sm" onClick={() => window.print()}>
          🖨 Yazdır / PDF olarak kaydet
        </button>
        <p className="text-xs text-slate-500">
          Bu sayfa salt okunurdur. Sorularınız için{' '}
          {s.businessName?.trim() ? s.businessName.trim() : 'işletme'} ile iletişime geçebilirsiniz.
        </p>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  brand,
}: {
  children: React.ReactNode;
  brand?: string | null;
}) {
  const name = brand?.trim() || 'Hesap Portalı';
  const letter = (name[0] ?? 'H').toLocaleUpperCase('tr-TR');
  return (
    <div className="min-h-full bg-slate-50 px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-lg space-y-4 sm:max-w-2xl">
        {/* <header> değil: yazdırırken başlıklar gizlenir, ekstrede işletme adı kalmalı. */}
        <div className="flex items-center justify-center gap-3 py-2">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white shadow-sm"
            aria-hidden
          >
            {letter}
          </div>
          <div className="min-w-0 text-left">
            <div className="break-words text-lg font-bold leading-tight tracking-tight text-slate-900">{name}</div>
            <div className="text-xs text-slate-500">Hesap ekstresi</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

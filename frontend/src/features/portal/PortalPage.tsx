import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  fetchPortalDocuments,
  fetchPortalLedger,
  fetchPortalSummary,
} from '../../api/portal.api';

/**
 * Müşteri self-servis portalı (PUBLIC). Giriş gerektirmez; tahmin edilemez
 * token'lı bağlantı ile açılır. Salt-okunur: bakiye + son hareketler + belgeler.
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
    return (
      <Shell>
        <div className="card text-center text-slate-500">
          Bağlantı geçersiz veya iptal edilmiş.
        </div>
      </Shell>
    );
  }
  if (!summaryQ.data) {
    return (
      <Shell>
        <p className="text-center text-slate-400">Yükleniyor…</p>
      </Shell>
    );
  }

  const s = summaryQ.data;
  const money = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: s.currency,
  });

  return (
    <Shell>
      <div className="card">
        <p className="text-sm text-slate-500">{s.companyName ?? s.name}</p>
        <p className="mt-1 text-xs text-slate-400">Güncel bakiye</p>
        <p
          className={`text-3xl font-bold ${
            s.currentBalance > 0 ? 'text-red-600' : 'text-emerald-600'
          }`}
        >
          {money.format(s.currentBalance)}
        </p>
        {s.currentBalance > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Bu tutar tarafımıza borcunuzu gösterir.
          </p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Son Hareketler</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">Tarih</th>
              <th className="py-1">Açıklama</th>
              <th className="py-1 text-right">Borç</th>
              <th className="py-1 text-right">Alacak</th>
              <th className="py-1 text-right">Bakiye</th>
            </tr>
          </thead>
          <tbody>
            {ledgerQ.data?.map((e, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1">
                  {new Date(e.date).toLocaleDateString('tr-TR')}
                </td>
                <td className="py-1">{e.description ?? e.sourceType}</td>
                <td className="py-1 text-right">
                  {e.type === 'debit' ? money.format(e.amount) : ''}
                </td>
                <td className="py-1 text-right text-emerald-600">
                  {e.type === 'credit' ? money.format(e.amount) : ''}
                </td>
                <td className="py-1 text-right">{money.format(e.balanceAfter)}</td>
              </tr>
            ))}
            {!ledgerQ.data?.length && (
              <tr>
                <td colSpan={5} className="py-2 text-center text-slate-400">
                  Hareket yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!!docsQ.data &&
        (docsQ.data.sales.length > 0 || docsQ.data.processing.length > 0) && (
          <div className="card">
            <h2 className="mb-2 font-semibold">Belgeler</h2>
            <ul className="space-y-1 text-sm">
              {docsQ.data.sales.map((d) => (
                <li key={d.id} className="flex justify-between">
                  <span>
                    Satış · {new Date(d.date).toLocaleDateString('tr-TR')}
                  </span>
                  <span>{money.format(d.total)}</span>
                </li>
              ))}
              {docsQ.data.processing.map((d) => (
                <li key={d.id} className="flex justify-between">
                  <span>
                    İşleme · {d.item ?? ''} ·{' '}
                    {new Date(d.date).toLocaleDateString('tr-TR')}
                  </span>
                  <span>{money.format(d.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50 p-4">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="py-2 text-center text-lg font-bold tracking-tight text-slate-900">
          Stock<span className="text-slate-400">Track</span>
        </div>
        {children}
      </div>
    </div>
  );
}

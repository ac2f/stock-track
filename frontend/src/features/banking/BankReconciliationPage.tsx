import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  confirmMatch,
  fetchBankTransactions,
  fetchMatchSuggestions,
  fetchReconciliationSummary,
  guessMapping,
  ignoreTransaction,
  importStatement,
  readCsvHeaders,
  unmatchTransaction,
  type BankTransaction,
  type BankTxStatus,
  type ColumnMapping,
} from '../../api/bank-reconciliation.api';
import { fetchBankAccounts } from '../../api/bank-accounts.api';

const money = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

/** Eşlemede seçilebilecek alanlar ve kullanıcıya görünen adları. */
const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; hint?: string }[] = [
  { key: 'date', label: 'Tarih *' },
  { key: 'amount', label: 'Tutar (tek sütun)', hint: 'Girişler +, çıkışlar − ise' },
  { key: 'credit', label: 'Alacak / Giren', hint: 'Borç-alacak ayrı sütunsa' },
  { key: 'debit', label: 'Borç / Çıkan' },
  { key: 'description', label: 'Açıklama' },
  { key: 'counterpartyName', label: 'Karşı taraf adı' },
  { key: 'counterpartyIban', label: 'Karşı taraf IBAN' },
  { key: 'externalId', label: 'Dekont / referans no', hint: 'Mükerrer yüklemeyi önler' },
  { key: 'balanceAfter', label: 'Bakiye' },
];

/**
 * Banka mutabakatı: ekstre yükle, hareketleri tahsilat/gider kayıtlarıyla
 * eşleştir.
 *
 * Eşleştirme hiçbir zaman kendiliğinden onaylanmaz — sistem yalnızca aday
 * önerir, kararı kullanıcı verir.
 */
export function BankReconciliationPage() {
  const qc = useQueryClient();
  const [bankAccountId, setBankAccountId] = useState('');
  const [status, setStatus] = useState<BankTxStatus>('unmatched');

  const { data: accounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: fetchBankAccounts,
  });
  const { data: summary } = useQuery({
    queryKey: ['reconciliation-summary', bankAccountId],
    queryFn: () => fetchReconciliationSummary(bankAccountId || undefined),
  });
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['bank-transactions', bankAccountId, status],
    queryFn: () =>
      fetchBankTransactions({
        bankAccountId: bankAccountId || undefined,
        status,
      }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Banka Mutabakat</h1>
        <p className="text-sm text-slate-500">
          Banka ekstresini yükleyin; hareketler tahsilat ve gider kayıtlarınızla
          eşleştirilsin. Öneriler <b>onayınızı bekler</b> — hiçbir eşleştirme
          kendiliğinden yapılmaz.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryTile label="Bekleyen" value={String(summary.unmatched)} tone="amber" />
          <SummaryTile label="Eşleşen" value={String(summary.matched)} tone="emerald" />
          <SummaryTile
            label="Bekleyen giriş"
            value={money.format(summary.unmatchedIncoming)}
            tone="slate"
          />
          <SummaryTile
            label="Bekleyen çıkış"
            value={money.format(Math.abs(summary.unmatchedOutgoing))}
            tone="slate"
          />
        </div>
      )}

      <div className="card space-y-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">Banka hesabı</span>
          <select
            className="input"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
          >
            <option value="">Tüm hesaplar</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bankName}
                {a.iban ? ` · ${a.iban}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <StatementImport
        accounts={accounts ?? []}
        defaultAccountId={bankAccountId}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ['bank-transactions'] });
          qc.invalidateQueries({ queryKey: ['reconciliation-summary'] });
        }}
      />

      <div className="flex gap-1 text-xs">
        {(
          [
            ['unmatched', 'Bekleyen'],
            ['matched', 'Eşleşen'],
            ['ignored', 'Hariç'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              status === value
                ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : !transactions?.length ? (
        <div className="card text-center text-sm text-slate-500">
          {status === 'unmatched'
            ? 'Bekleyen hareket yok. Ekstre yükleyerek başlayın.'
            : 'Bu durumda hareket yok.'}
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'amber' | 'emerald' | 'slate';
}) {
  const cls = {
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    emerald:
      'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
    slate: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  }[tone];
  return (
    <div className={`rounded-xl p-3 ${cls}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Ekstre yükleme + sütun eşleme. Bankaya özel değildir. */
function StatementImport({
  accounts,
  defaultAccountId,
  onImported,
}: {
  accounts: { id: string; bankName: string; iban?: string }[];
  defaultAccountId: string;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: '' });
  const [accountId, setAccountId] = useState(defaultAccountId);

  const importMut = useMutation({
    mutationFn: () =>
      importStatement({ bankAccountId: accountId, csv, mapping }),
    onSuccess: () => {
      onImported();
      setCsv('');
      setHeaders([]);
      if (fileRef.current) fileRef.current.value = '';
    },
  });

  const onFile = async (file: File) => {
    const text = await file.text();
    const cols = readCsvHeaders(text);
    setCsv(text);
    setHeaders(cols);
    // Sütunları başlıklardan tahmin et — çoğu ekstrede elle seçim gerekmez.
    setMapping(guessMapping(cols));
    importMut.reset();
  };

  const ready =
    !!accountId && !!csv && !!mapping.date && (!!mapping.amount || !!mapping.credit || !!mapping.debit);

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        ⬆️ Ekstre yükle (CSV)
      </button>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Ekstre yükle</h2>
        <button className="btn bg-slate-100 text-xs" onClick={() => setOpen(false)}>
          Kapat
        </button>
      </div>
      <p className="text-xs text-slate-500">
        İnternet bankacılığından indirdiğiniz hesap hareketlerini <b>CSV</b>{' '}
        olarak kaydedip yükleyin. Sütunlar başlıklardan otomatik tahmin edilir;
        yanlışsa aşağıdan düzeltin. Aynı dosyayı tekrar yüklerseniz mükerrer
        kayıt oluşmaz.
      </p>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-slate-500">Hangi hesabın ekstresi?</span>
        <select
          className="input"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Hesap seçin…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.bankName}
              {a.iban ? ` · ${a.iban}` : ''}
            </option>
          ))}
        </select>
      </label>

      <input
        ref={fileRef}
        className="block text-sm"
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />

      {headers.length > 0 && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <p className="text-xs font-semibold">
            Sütun eşleme ({headers.length} sütun bulundu)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MAPPING_FIELDS.map((f) => (
              <label key={f.key} className="block text-xs">
                <span className="mb-1 block text-slate-500">{f.label}</span>
                <select
                  className="input"
                  value={(mapping[f.key] as string) ?? ''}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [f.key]: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">— yok —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {f.hint && (
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {f.hint}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {importMut.isError && (
        <p className="text-sm text-red-600">
          {(importMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Ekstre yüklenemedi.'}
        </p>
      )}
      {importMut.isSuccess && (
        <p className="text-sm text-emerald-700">
          ✅ {importMut.data.imported} yeni hareket eklendi.
          {importMut.data.duplicates > 0 &&
            ` ${importMut.data.duplicates} mükerrer atlandı.`}
          {importMut.data.skipped > 0 &&
            ` ${importMut.data.skipped} satır çözülemedi.`}
        </p>
      )}

      <button
        className="btn-primary"
        disabled={!ready || importMut.isPending}
        onClick={() => importMut.mutate()}
      >
        {importMut.isPending ? 'Yükleniyor…' : 'İçe aktar'}
      </button>
    </div>
  );
}

/** Tek banka hareketi + eşleşme adayları. */
function TransactionRow({ tx }: { tx: BankTransaction }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const incoming = Number(tx.amount) > 0;

  const { data: suggestions, isFetching } = useQuery({
    queryKey: ['match-suggestions', tx.id],
    queryFn: () => fetchMatchSuggestions(tx.id),
    enabled: open && tx.status === 'unmatched',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['bank-transactions'] });
    qc.invalidateQueries({ queryKey: ['reconciliation-summary'] });
  };
  const matchMut = useMutation({
    mutationFn: (s: { type: 'payment' | 'expense'; id: string }) =>
      confirmMatch(tx.id, s.type, s.id),
    onSuccess: refresh,
  });
  const ignoreMut = useMutation({
    mutationFn: () => ignoreTransaction(tx.id),
    onSuccess: refresh,
  });
  const unmatchMut = useMutation({
    mutationFn: () => unmatchTransaction(tx.id),
    onSuccess: refresh,
  });

  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {tx.counterpartyName || tx.description || 'Banka hareketi'}
          </p>
          <p className="truncate text-xs text-slate-500">
            {tx.transactionDate}
            {tx.bankAccount ? ` · ${tx.bankAccount.bankName}` : ''}
            {tx.counterpartyName && tx.description ? ` · ${tx.description}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 text-sm font-bold tabular-nums ${
            incoming ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {incoming ? '+' : '−'}
          {money.format(Math.abs(Number(tx.amount)))}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tx.status === 'unmatched' && (
          <>
            <button
              className="btn bg-slate-100 text-xs"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Gizle' : '🔎 Eşleşme ara'}
            </button>
            <button
              className="btn bg-slate-100 text-xs"
              disabled={ignoreMut.isPending}
              onClick={() => ignoreMut.mutate()}
              title="Bu hareket mutabakat dışında kalsın (ör. hesaplar arası virman)"
            >
              Hariç tut
            </button>
          </>
        )}
        {tx.status === 'matched' && (
          <>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              ✓ {tx.matchType === 'payment' ? 'Ödemeyle' : 'Giderle'} eşleşti
            </span>
            <button
              className="btn bg-slate-100 text-xs"
              disabled={unmatchMut.isPending}
              onClick={() => unmatchMut.mutate()}
            >
              Eşleştirmeyi kaldır
            </button>
          </>
        )}
        {tx.status === 'ignored' && (
          <>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
              Hariç tutuldu
            </span>
            <button
              className="btn bg-slate-100 text-xs"
              disabled={unmatchMut.isPending}
              onClick={() => unmatchMut.mutate()}
            >
              Kuyruğa geri al
            </button>
          </>
        )}
      </div>

      {open && tx.status === 'unmatched' && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          {isFetching && (
            <p className="text-xs text-slate-400">Adaylar aranıyor…</p>
          )}
          {!isFetching && !suggestions?.length && (
            <p className="text-xs text-slate-500">
              Uygun aday bulunamadı. Kayıt henüz girilmemiş olabilir —{' '}
              {incoming ? 'tahsilatı' : 'gideri'} girip tekrar arayın.
            </p>
          )}
          {suggestions?.map((s) => (
            <div
              key={`${s.type}-${s.id}`}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{s.label}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  {s.date} · {money.format(s.amount)} · {s.reasons.join(', ')}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  s.score >= 85
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-800'
                }`}
                title="Eşleşme güveni"
              >
                %{s.score}
              </span>
              <button
                className="btn shrink-0 bg-emerald-600 px-2 py-1 text-xs text-white"
                disabled={matchMut.isPending}
                onClick={() => matchMut.mutate({ type: s.type, id: s.id })}
              >
                Eşleştir
              </button>
            </div>
          ))}
          {matchMut.isError && (
            <p className="text-xs text-red-600">
              {(matchMut.error as { response?: { data?: { message?: string } } })
                ?.response?.data?.message ?? 'Eşleştirilemedi.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

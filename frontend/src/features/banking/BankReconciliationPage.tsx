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
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { formatDate, formatMoney } from '../../lib/format';
import { useBankAccounts } from '../../hooks/useReferenceData';


/** Eşlemede seçilebilecek alanlar ve kullanıcıya görünen adları. */
const MAPPING_FIELDS: {
  key: keyof ColumnMapping;
  label: string;
  hint?: string;
  required?: boolean;
}[] = [
  { key: 'date', label: 'Tarih', required: true },
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

  const { data: accounts } = useBankAccounts();
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

  const [importOpen, setImportOpen] = useState(false);
  const counts: Record<BankTxStatus, number | undefined> = {
    unmatched: summary?.unmatched,
    matched: summary?.matched,
    ignored: summary?.ignored,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Banka Mutabakat"
        icon="🏦"
        subtitle={
          <>
            Banka ekstresini yükleyin; hareketler tahsilat ve gider kayıtlarınızla
            eşleştirilsin. Öneriler <b>onayınızı bekler</b> — hiçbir eşleştirme
            kendiliğinden yapılmaz.
          </>
        }
        actions={
          !importOpen && (
            <button
              className="btn-primary"
              data-hotkey="n"
              title="Ekstre yükle (N)"
              onClick={() => setImportOpen(true)}
            >
              ⬆️ Ekstre yükle (CSV)
            </button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {summary ? (
          <>
            <SummaryTile icon="⏳" label="Bekleyen" value={String(summary.unmatched)} tone="amber" />
            <SummaryTile icon="✅" label="Eşleşen" value={String(summary.matched)} tone="emerald" />
            <SummaryTile
              icon="⬇️"
              label="Bekleyen giriş"
              value={formatMoney(summary.unmatchedIncoming)}
              tone="slate"
              valueClass="text-emerald-700 dark:text-emerald-300"
            />
            <SummaryTile
              icon="⬆️"
              label="Bekleyen çıkış"
              value={formatMoney(Math.abs(summary.unmatchedOutgoing))}
              tone="slate"
              valueClass="text-red-600 dark:text-red-300"
            />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[76px] rounded-2xl" />)
        )}
      </div>

      <div className="card">
        <label className="block">
          <span className="label">Banka hesabı</span>
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
        {accounts && accounts.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Henüz banka hesabı tanımlı değil. Ekstre yüklemek için önce Ödemeler ekranındaki
            havale bölümünden banka hesabı ekleyin.
          </p>
        )}
      </div>

      {importOpen && (
        <StatementImport
          accounts={accounts ?? []}
          defaultAccountId={bankAccountId}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ['bank-transactions'] });
            qc.invalidateQueries({ queryKey: ['reconciliation-summary'] });
          }}
        />
      )}

      {/* Durum sekmeleri: segmentli düğme, her birinde kayıt sayısı. */}
      <div
        role="tablist"
        aria-label="Hareket durumu"
        className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 sm:inline-grid sm:min-w-[24rem]"
      >
        {(
          [
            ['unmatched', 'Bekleyen'],
            ['matched', 'Eşleşen'],
            ['ignored', 'Hariç'],
          ] as const
        ).map(([value, label]) => {
          const active = status === value;
          const n = counts[value];
          return (
            <button
              key={value}
              role="tab"
              aria-selected={active}
              className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition ${
                active
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setStatus(value)}
            >
              {label}
              {n != null && (
                <span
                  className={`rounded-full px-1.5 text-[11px] font-semibold leading-5 tabular-nums ${
                    active
                      ? value === 'unmatched' && n > 0
                        ? 'bg-amber-100 text-amber-800'
                        : value === 'matched'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <LoadingBlock rows={3} />
      ) : !transactions?.length ? (
        status === 'unmatched' ? (
          <EmptyState
            icon="🎉"
            title="Bekleyen hareket yok."
            hint={
              importOpen
                ? 'Yukarıdan ekstre dosyasını seçip içe aktarın; eşleşmeyi bekleyen hareketler burada listelenir.'
                : 'Ekstre yükleyerek başlayın: hareketler burada listelenir, her biri için tahsilat ya da gider adayı önerilir.'
            }
          />
        ) : (
          <EmptyState
            compact
            icon={status === 'matched' ? '🔗' : '🚫'}
            title="Bu durumda hareket yok."
            hint={
              status === 'matched'
                ? 'Onayladığınız eşleştirmeler burada görünür.'
                : '"Hariç tut" dediğiniz hareketler (ör. hesaplar arası virman) burada görünür.'
            }
          />
        )
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
  icon,
  label,
  value,
  tone,
  valueClass = '',
}: {
  icon: string;
  label: string;
  value: string;
  tone: 'amber' | 'emerald' | 'slate';
  valueClass?: string;
}) {
  const cls = {
    amber:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/30 dark:text-amber-200',
    emerald:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200',
    slate: 'border-slate-200 bg-white text-slate-700 dark:text-slate-200',
  }[tone];
  return (
    <div className={`min-w-0 rounded-2xl border p-3 shadow-sm ${cls}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <span aria-hidden>{icon}</span>
        {label}
      </p>
      <p className={`mt-1 text-lg font-bold leading-tight tabular-nums [overflow-wrap:anywhere] ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

/** Ekstre yükleme + sütun eşleme. Bankaya özel değildir. */
function StatementImport({
  accounts,
  defaultAccountId,
  onImported,
  onClose,
}: {
  accounts: { id: string; bankName: string; iban?: string }[];
  defaultAccountId: string;
  onImported: () => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
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

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Ekstre yükle</h2>
        <button className="btn-secondary btn-sm" onClick={onClose}>
          Kapat
        </button>
      </div>
      <p className="text-xs text-slate-500">
        İnternet bankacılığından indirdiğiniz hesap hareketlerini <b>CSV</b>{' '}
        olarak kaydedip yükleyin. Sütunlar başlıklardan otomatik tahmin edilir;
        yanlışsa aşağıdan düzeltin. Aynı dosyayı tekrar yüklerseniz mükerrer
        kayıt oluşmaz.
      </p>

      <label className="block">
        <span className="label">
          Hangi hesabın ekstresi?<span className="text-red-600" aria-hidden> *</span>
        </span>
        <select
          className="input"
          autoFocus
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
        aria-label="Ekstre dosyası (CSV)"
        className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:min-h-[40px] file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200 dark:file:bg-slate-700 dark:file:text-slate-100"
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />

      {headers.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-semibold">
            Sütun eşleme ({headers.length} sütun bulundu)
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MAPPING_FIELDS.map((f) => (
              <label key={f.key} className="block min-w-0">
                <span className="label">
                  {f.label}
                  {f.required && (
                    <span className="text-red-600" aria-hidden>
                      {' '}
                      *
                    </span>
                  )}
                </span>
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
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {f.hint}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {importMut.isError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {(importMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Ekstre yüklenemedi.'}
        </p>
      )}
      {importMut.isSuccess && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-900/30 dark:text-emerald-200">
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
        {importMut.isPending ? (
          <>
            <Spinner /> Yükleniyor…
          </>
        ) : (
          'İçe aktar'
        )}
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
          <p className="truncate text-sm font-semibold">
            {tx.counterpartyName || tx.description || 'Banka hareketi'}
          </p>
          <p className="truncate text-xs text-slate-500">
            {formatDate(tx.transactionDate?.slice(0, 10))}
            {tx.bankAccount ? ` · ${tx.bankAccount.bankName}` : ''}
            {tx.counterpartyName && tx.description ? ` · ${tx.description}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 text-right text-base font-bold tabular-nums ${
            incoming ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {incoming ? '+' : '−'}
          {formatMoney(Math.abs(Number(tx.amount)))}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tx.status === 'unmatched' && (
          <>
            <button
              className="btn-secondary btn-sm"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Gizle' : '🔎 Eşleşme ara'}
            </button>
            <button
              className="btn-ghost btn-sm"
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
            <span className="badge bg-emerald-100 text-emerald-800">
              ✓ {tx.matchType === 'payment' ? 'Ödemeyle' : 'Giderle'} eşleşti
            </span>
            <button
              className="btn-secondary btn-sm"
              disabled={unmatchMut.isPending}
              onClick={() => unmatchMut.mutate()}
            >
              Eşleştirmeyi kaldır
            </button>
          </>
        )}
        {tx.status === 'ignored' && (
          <>
            <span className="badge bg-slate-200 text-slate-700">Hariç tutuldu</span>
            <button
              className="btn-secondary btn-sm"
              disabled={unmatchMut.isPending}
              onClick={() => unmatchMut.mutate()}
            >
              Kuyruğa geri al
            </button>
          </>
        )}
      </div>

      {open && tx.status === 'unmatched' && (
        <div className="space-y-1.5 rounded-xl bg-slate-50 p-2 dark:bg-slate-900/50">
          {isFetching && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Spinner className="h-3 w-3" /> Adaylar aranıyor…
            </p>
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
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 sm:flex-nowrap dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="min-w-0 flex-1 basis-48">
                <span className="block truncate text-sm font-medium">{s.label}</span>
                <span className="block text-[11px] text-slate-500">
                  <span className="tabular-nums">{formatDate(s.date?.slice(0, 10))}</span> ·{' '}
                  <span className="font-semibold tabular-nums text-slate-700">{formatMoney(s.amount)}</span>
                  {s.reasons.length > 0 && <> · {s.reasons.join(', ')}</>}
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
                className="btn-success btn-sm shrink-0"
                disabled={matchMut.isPending}
                onClick={() => matchMut.mutate({ type: s.type, id: s.id })}
              >
                Eşleştir
              </button>
            </div>
          ))}
          {matchMut.isError && (
            <p role="alert" className="text-xs text-red-600">
              {(matchMut.error as { response?: { data?: { message?: string } } })
                ?.response?.data?.message ?? 'Eşleştirilemedi.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

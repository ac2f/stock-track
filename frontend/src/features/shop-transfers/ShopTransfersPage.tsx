import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPendingTransferCount, fetchShopTransfers, type TransferStatusFilter } from '../../api/shop-transfers.api';
import { Can } from '../../components/Can';
import { Pagination } from '../../components/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { usePageSize } from '../../hooks/usePageSize';
import { useUrlParam } from '../../hooks/useUrlParam';
import { apiErrorMessage } from '../../lib/toast';
import { GrantsSection } from './GrantsSection';
import { MarketplaceSection } from './MarketplaceSection';
import { NewTransferForm } from './NewTransferForm';
import { StockSharesSection } from './StockSharesSection';
import { TransferCard } from './TransferCard';

type Section = 'docs' | 'market' | 'shares' | 'grants';
type DocTab = 'open' | 'all' | 'out' | 'in';

const SECTION_IDS: Section[] = ['docs', 'market', 'shares', 'grants'];

function CountPill({ n, tone = 'amber' }: { n: number; tone?: 'amber' | 'slate' }) {
  if (n <= 0) return null;
  return (
    <span
      className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
        tone === 'amber' ? 'bg-amber-500 text-white' : 'bg-slate-300 text-slate-700'
      }`}
    >
      {n}
    </span>
  );
}

/** Belgeler: sattıklarımız / aldıklarımız, onay bekleyenler ve geri alma talepleri. */
function DocumentsSection({
  showForm,
  setShowForm,
  initialPlateId,
  setInitialPlateId,
  initialTerm,
}: {
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  initialPlateId?: string;
  setInitialPlateId: (id?: string) => void;
  initialTerm: string;
}) {
  const { can, shop } = useAuth();
  const canOut = can('sales');
  const canIn = can('purchases');
  const [tab, setTab] = useState<DocTab>('all');
  const [term, setTerm] = useState(initialTerm);
  const search = useDebounced(term.trim());
  const [pageSize, setPageSize] = usePageSize('shop-transfers', 20);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, tab]);
  useEffect(() => {
    if (initialTerm) setTerm(initialTerm);
  }, [initialTerm]);

  const { data: counts } = useQuery({
    queryKey: ['shop-transfers', 'pending-count', shop?.id],
    queryFn: fetchPendingTransferCount,
    staleTime: 15_000,
  });
  const awaiting = counts?.awaitingMe ?? 0;
  const waiting = counts?.waitingOthers ?? 0;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shop-transfers', tab, search, page, pageSize, shop?.id],
    queryFn: () =>
      fetchShopTransfers({
        direction: tab === 'out' || tab === 'in' ? tab : undefined,
        status: (tab === 'open' ? 'open' : undefined) as TransferStatusFilter | undefined,
        search: search || undefined,
        page,
        limit: pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const tabs: { id: DocTab; label: string; show: boolean; count?: number }[] = [
    { id: 'open', label: 'Onay bekleyenler', show: true, count: awaiting + waiting },
    { id: 'all', label: 'Tümü', show: canOut && canIn },
    { id: 'out', label: 'Sattıklarımız', show: canOut },
    { id: 'in', label: 'Aldıklarımız', show: canIn },
  ];

  return (
    <div className="space-y-4">
      {showForm && (
        <NewTransferForm
          initialPlateId={initialPlateId}
          onDone={() => {
            setShowForm(false);
            setInitialPlateId(undefined);
            setTab('open');
          }}
          onCancel={() => {
            setShowForm(false);
            setInitialPlateId(undefined);
          }}
        />
      )}

      {awaiting > 0 && tab !== 'open' && (
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-left text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
          onClick={() => setTab('open')}
        >
          <span>
            <b>{awaiting}</b> işlem onayınızı bekliyor.
          </span>
          <span className="font-semibold underline">Göster</span>
        </button>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Belge listesi">
          {tabs
            .filter((x) => x.show)
            .map((x) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={tab === x.id}
                className={tab === x.id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                onClick={() => setTab(x.id)}
              >
                {x.label}
                {x.id === 'open' && <CountPill n={awaiting} />}
                {x.id === 'open' && awaiting === 0 && <CountPill n={waiting} tone="slate" />}
              </button>
            ))}
        </div>
        <SearchInput className="sm:w-72" value={term} onChange={setTerm} placeholder="Belge no, işletme ya da malzeme ara…" />
      </div>

      {isLoading && <LoadingBlock rows={2} />}
      {isError && (
        <p role="alert" className="text-sm text-red-600">
          {apiErrorMessage(error, 'Liste alınamadı.')}
        </p>
      )}
      {data?.items.map((t) => <TransferCard key={t.id} t={t} />)}
      {data?.meta && data.meta.total > 0 && (
        <Pagination
          page={data.meta.page}
          pageCount={data.meta.pageCount}
          total={data.meta.total}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      )}
      {!isLoading && !isError && !data?.items.length && (
        <EmptyState
          icon={tab === 'open' ? '✅' : '🔁'}
          title={
            search
              ? 'Aramaya uyan kayıt yok.'
              : tab === 'open'
                ? 'Onay bekleyen işlem yok.'
                : 'Henüz işletmeler arası satış yok.'
          }
          hint={
            search
              ? undefined
              : tab === 'open'
                ? 'Başka bir işletme size teklif ya da talep gönderdiğinde, ya da sizin gönderdikleriniz karşı onayı beklerken burada görünür.'
                : 'Başka bir işletmeye malzeme sattığınızda ya da bir işletmenin "bende var" stoğundan talep gönderdiğinizde burada görünür.'
          }
          action={
            !search && !showForm && tab !== 'open' ? (
              <Can module="sales" level="write">
                <button className="btn-secondary" onClick={() => setShowForm(true)}>
                  İlk satışı gir
                </button>
              </Can>
            ) : undefined
          }
        />
      )}
      <p className="text-xs text-slate-500">
        İpucu: Alan işletmenin borcu bu işletmede onun adına açılan caride izlenir; ödeme geldiğinde{' '}
        <Link className="underline" to="/payments">
          Tahsilat
        </Link>{' '}
        ekranından girin.
      </p>
    </div>
  );
}

/**
 * 🔁 İşletmeler arası satış: her işletme herhangi bir işletmeye satış teklifi gönderebilir ya da onun "bende var"
 * listesinden talep açabilir; işlem karşı tarafın onayıyla gerçekleşir. Yetkiler ekranından güvenilen işletmelere
 * otomatik onay verilir; stoklar isteğe bağlı olarak "bende var" diye paylaşılır.
 */
export function ShopTransfersPage() {
  const { can, shop } = useAuth();
  const visible: Record<Section, boolean> = {
    docs: can('sales') || can('purchases'),
    market: can('purchases'),
    shares: can('stock'),
    grants: can('settings'),
  };
  const first = SECTION_IDS.find((s) => visible[s]) ?? 'docs';
  const [section, setSection] = useState<Section>(first);
  const [showForm, setShowForm] = useState(false);
  const [initialPlateId, setInitialPlateId] = useState<string | undefined>();
  const [initialTerm, setInitialTerm] = useState('');

  useUrlParam('new', () => {
    if (can('sales', 'write')) {
      setSection('docs');
      setShowForm(true);
    }
  });
  useUrlParam('plate', (id) => {
    if (!can('sales', 'write')) return;
    setSection('docs');
    setInitialPlateId(id);
    setShowForm(true);
  });
  useUrlParam('q', (q) => {
    setSection('docs');
    setInitialTerm(q);
  });
  useUrlParam('tab', (v) => {
    const s = SECTION_IDS.find((x) => x === v);
    if (s && visible[s]) setSection(s);
  });

  const { data: counts } = useQuery({
    queryKey: ['shop-transfers', 'pending-count', shop?.id],
    queryFn: fetchPendingTransferCount,
    enabled: visible.docs,
    staleTime: 15_000,
  });

  const sections: { id: Section; label: string; icon: string }[] = [
    { id: 'docs', label: 'Belgeler', icon: '📄' },
    { id: 'market', label: 'Pazar yeri', icon: '🛍️' },
    { id: 'shares', label: 'Bende var', icon: '📣' },
    { id: 'grants', label: 'Yetkiler', icon: '🤝' },
  ];

  // Görünür bölümlerden birine düşmek (izinler değişirse/işletme değişirse).
  const current = visible[section] ? section : first;

  return (
    <div className="space-y-4">
      <PageHeader
        title="İşletmeler Arası Satış"
        icon="🔁"
        subtitle="Başka işletmelere satış teklifi gönderin ya da onların 'bende var' stoğundan talep açın. Her işlem karşı tarafın onayıyla gerçekleşir."
        actions={
          current === 'docs' && (
            <Can module="sales" level="write">
              {showForm ? (
                <button className="btn-secondary" onClick={() => setShowForm(false)}>
                  Kapat
                </button>
              ) : (
                <button className="btn-primary" data-hotkey="n" title="Başka işletmeye sat (N)" onClick={() => setShowForm(true)}>
                  + Başka işletmeye sat
                </button>
              )}
            </Can>
          )
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2 dark:border-slate-700" role="tablist" aria-label="Bölümler">
        {sections
          .filter((s) => visible[s.id])
          .map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={current === s.id}
              data-section={s.id}
              className={current === s.id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => setSection(s.id)}
            >
              <span aria-hidden>{s.icon}</span> {s.label}
              {s.id === 'docs' && <CountPill n={counts?.awaitingMe ?? 0} />}
            </button>
          ))}
      </div>

      {current === 'docs' && (
        <DocumentsSection
          showForm={showForm}
          setShowForm={setShowForm}
          initialPlateId={initialPlateId}
          setInitialPlateId={setInitialPlateId}
          initialTerm={initialTerm}
        />
      )}
      {current === 'market' && <MarketplaceSection onSent={() => setSection('docs')} />}
      {current === 'shares' && <StockSharesSection />}
      {current === 'grants' && <GrantsSection />}
    </div>
  );
}

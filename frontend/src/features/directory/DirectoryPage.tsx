import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  fetchDirectoryFacets,
  fetchDirectoryMachines,
  fetchDirectoryShops,
  fetchMachineTypeTree,
  type DirectoryMachine,
  type DirectoryMachineHit,
  type DirectoryQuery,
  type DirectoryShop,
} from '../../api/directory.api';
import { Pagination } from '../../components/Pagination';
import { LabelChips } from '../../components/network/LabelChips';
import { LocationPicker } from '../../components/network/LocationPicker';
import { MachineTypeSelect, sizeLabel } from '../../components/network/MachineTypeSelect';
import { EmptyState } from '../../components/ui/EmptyState';
import { Filters } from '../../components/ui/Filters';
import { LoadingBlock } from '../../components/ui/Loading';
import { PagePlaceholderError } from './parts';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';

type Tab = 'shops' | 'machines';

const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
const waHref = (p: string) => {
  const d = p.replace(/\D/g, '');
  const intl = d.startsWith('90') ? d : d.startsWith('0') ? `9${d}` : d.length === 10 ? `90${d}` : d;
  return `https://wa.me/${intl}`;
};
const webHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

/**
 * İşletme rehberi: diğer işletmeleri il/ilçe, iş kolu ve makineye (tür + en az
 * şu çalışma alanı) göre bulun; telefon/e-posta ile ulaşın. Yalnız kendini
 * rehberde göstermeyi seçen işletmeler listelenir.
 */
export function DirectoryPage() {
  const { shop } = useAuth();
  const [tab, setTab] = useState<Tab>('shops');
  const [search, setSearch] = useState('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [machineTypeId, setMachineTypeId] = useState('');
  const [minW, setMinW] = useState('');
  const [minH, setMinH] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const q = useDebounced(search.trim(), 350);
  const w = useDebounced(minW, 400);
  const h = useDebounced(minH, 400);

  const query: DirectoryQuery = useMemo(
    () => ({
      q: q || undefined,
      province: province || undefined,
      district: district || undefined,
      labelIds: labelIds.length ? labelIds : undefined,
      machineTypeId: machineTypeId || undefined,
      minWidthMm: Number(w) > 0 ? Number(w) : undefined,
      minHeightMm: Number(h) > 0 ? Number(h) : undefined,
      page,
      limit: pageSize,
    }),
    [q, province, district, labelIds, machineTypeId, w, h, page, pageSize],
  );
  const reset = () => {
    setSearch('');
    setProvince('');
    setDistrict('');
    setLabelIds([]);
    setMachineTypeId('');
    setMinW('');
    setMinH('');
    setPage(1);
  };
  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const facets = useQuery({
    queryKey: ['directory', 'facets', province],
    queryFn: () => fetchDirectoryFacets(province || undefined),
    staleTime: 60_000,
  });
  const types = useQuery({ queryKey: ['machine-type-tree'], queryFn: fetchMachineTypeTree, staleTime: 5 * 60_000 });
  const shops = useQuery({
    queryKey: ['directory', 'shops', query],
    queryFn: () => fetchDirectoryShops(query),
    enabled: tab === 'shops',
    placeholderData: keepPreviousData,
  });
  const machines = useQuery({
    queryKey: ['directory', 'machines', query],
    queryFn: () => fetchDirectoryMachines(query),
    enabled: tab === 'machines',
    placeholderData: keepPreviousData,
  });

  const provinceCounts = useMemo(() => Object.fromEntries((facets.data?.provinces ?? []).map((p) => [p.name, p.count])), [facets.data]);
  const districtCounts = useMemo(() => Object.fromEntries((facets.data?.districts ?? []).map((p) => [p.name, p.count])), [facets.data]);
  const labelCounts = useMemo(() => Object.fromEntries((facets.data?.labels ?? []).map((l) => [l.id, l.count])), [facets.data]);
  const typeCounts = useMemo(() => Object.fromEntries((facets.data?.machineTypes ?? []).map((t) => [t.id, t.count])), [facets.data]);

  const active = [province, district, machineTypeId, minW, minH].filter(Boolean).length + (labelIds.length ? 1 : 0);
  const result = tab === 'shops' ? shops : machines;
  const meta = result.data?.meta;

  return (
    <div>
      <PageHeader
        icon="🧭"
        title="İşletme Rehberi"
        subtitle="İhtiyacınız olan makineye ya da iş koluna sahip işletmeleri bulun; il ve ilçeye göre yakındakileri görün."
      />

      <div className="mb-3 inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
        {(
          [
            ['shops', '🏭 İşletmeler'],
            ['machines', '⚙️ Makine ara'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setPage(1);
            }}
            className={`min-h-[40px] rounded-lg px-4 text-sm font-medium transition ${
              tab === id ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Filters
        search={<SearchInput value={search} onChange={touch(setSearch)} placeholder={tab === 'shops' ? 'İşletme, iş kolu, açıklama ara…' : 'Makine, marka, model ara…'} />}
        activeCount={active}
        onClear={reset}
      >
        <LocationPicker
          province={province}
          district={district}
          allowAll
          idPrefix="dir"
          provinceCounts={provinceCounts}
          districtCounts={districtCounts}
          onChange={(p, d) => {
            setProvince(p);
            setDistrict(d);
            setPage(1);
          }}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block min-w-0 lg:col-span-2">
            <span className="label">Makine türü (alt türler dahil)</span>
            <MachineTypeSelect
              types={types.data ?? []}
              value={machineTypeId}
              allowAll
              counts={typeCounts}
              onChange={touch(setMachineTypeId)}
            />
          </label>
          <label className="block min-w-0">
            <span className="label">En az en (mm)</span>
            <input className="input" type="number" inputMode="numeric" min={1} placeholder="örn. 1300" value={minW} onChange={(e) => touch(setMinW)(e.target.value)} />
          </label>
          <label className="block min-w-0">
            <span className="label">En az boy (mm)</span>
            <input className="input" type="number" inputMode="numeric" min={1} placeholder="örn. 900" value={minH} onChange={(e) => touch(setMinH)(e.target.value)} />
          </label>
        </div>
        {(minW || minH) && (
          <p className="text-xs text-slate-500">
            Ölçü, makine ters çevrilerek de sığıyorsa uyar ({minW || '…'} × {minH || '…'} mm iş parçası).
          </p>
        )}
        <div>
          <span className="label">İş kolu</span>
          {facets.data ? (
            <LabelChips labels={facets.data.labels} value={labelIds} counts={labelCounts} onChange={touch(setLabelIds)} />
          ) : (
            <LoadingBlock rows={1} />
          )}
        </div>
      </Filters>

      {result.isError && <PagePlaceholderError />}
      {result.isLoading && <LoadingBlock rows={4} />}

      {tab === 'shops' && shops.data && (
        <div className="space-y-3">
          {shops.data.items.length === 0 && (
            <EmptyState
              icon="🔎"
              title="Eşleşen işletme bulunamadı"
              hint="Süzgeçleri gevşetin: başka bir ilçe/il seçin, ölçüyü küçültün ya da iş kolu seçimini kaldırın."
              action={active || search ? <button className="btn-secondary" onClick={reset}>Süzgeçleri temizle</button> : undefined}
            />
          )}
          {shops.data.items.map((s) => (
            <ShopCard key={s.id} s={s} own={s.id === shop?.id} />
          ))}
        </div>
      )}

      {tab === 'machines' && machines.data && (
        <div className="space-y-3">
          {machines.data.items.length === 0 && (
            <EmptyState
              icon="🔎"
              title="Uyan makine bulunamadı"
              hint="Makine türünü genişletin (üst tür alt türleri de kapsar) ya da en az ölçüyü küçültün."
              action={active || search ? <button className="btn-secondary" onClick={reset}>Süzgeçleri temizle</button> : undefined}
            />
          )}
          {machines.data.items.map((m) => (
            <MachineHit key={m.id} m={m} own={m.shop.id === shop?.id} />
          ))}
        </div>
      )}

      {meta && meta.total > 0 && (
        <div className="mt-4">
          <Pagination
            page={meta.page}
            pageCount={meta.pageCount}
            total={meta.total}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Contact({ phone, email, website }: { phone: string | null; email: string | null; website?: string | null }) {
  if (!phone && !email && !website) return <p className="text-xs text-slate-500">İletişim bilgisi paylaşılmamış.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {phone && (
        <a className="btn-secondary btn-sm" href={telHref(phone)}>
          📞 {phone}
        </a>
      )}
      {phone && (
        <a className="btn-secondary btn-sm" href={waHref(phone)} target="_blank" rel="noreferrer noopener">
          💬 WhatsApp
        </a>
      )}
      {email && (
        <a className="btn-secondary btn-sm" href={`mailto:${email}`}>
          ✉️ {email}
        </a>
      )}
      {website && (
        <a className="btn-secondary btn-sm" href={webHref(website)} target="_blank" rel="noreferrer noopener">
          🌐 Web
        </a>
      )}
    </div>
  );
}

function machineLine(m: DirectoryMachine): string {
  return [m.typeName, sizeLabel(m.widthMm, m.heightMm), [m.brand, m.model].filter(Boolean).join(' '), m.quantity > 1 ? `× ${m.quantity}` : '']
    .filter(Boolean)
    .join(' · ');
}

function ShopCard({ s, own }: { s: DirectoryShop; own: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? s.machines : s.machines.slice(0, 4);
  return (
    <article className={`card space-y-3 ${own ? 'ring-2 ring-blue-300 dark:ring-blue-800' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {s.name}
            {own && <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">Siz</span>}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            📍 {[s.district, s.province].filter(Boolean).join(', ') || 'Konum belirtilmemiş'}
            {s.addressLine ? ` — ${s.addressLine}` : ''}
          </p>
          {s.contactPerson && <p className="text-xs text-slate-500">Yetkili: {s.contactPerson}</p>}
        </div>
        <p className="text-xs text-slate-400">Üyelik: {new Date(s.memberSince).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}</p>
      </div>
      {s.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {s.labels.map((l) => (
            <span key={l.id} className="badge bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">
              {l.name}
            </span>
          ))}
        </div>
      )}
      {s.description && <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{s.description}</p>}
      {s.machines.length > 0 && (
        <div>
          <p className="label">Makineler</p>
          <ul className="space-y-1">
            {shown.map((m) => (
              <li
                key={m.id}
                className={`rounded-lg px-2.5 py-1.5 text-sm ${
                  m.matches ? 'bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100' : 'bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-200'
                }`}
              >
                {m.matches && '✓ '}
                {m.name}
                {machineLine(m) && <span className="text-slate-500 dark:text-slate-400"> — {machineLine(m)}</span>}
              </li>
            ))}
          </ul>
          {s.machines.length > 4 && (
            <button className="mt-1 text-xs font-medium text-blue-600 hover:underline" onClick={() => setAll((a) => !a)}>
              {all ? 'Daha az göster' : `Tümünü göster (${s.machines.length})`}
            </button>
          )}
        </div>
      )}
      {!own && <Contact phone={s.phone} email={s.email} website={s.website} />}
    </article>
  );
}

function MachineHit({ m, own }: { m: DirectoryMachineHit; own: boolean }) {
  return (
    <article className={`card flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${own ? 'ring-2 ring-blue-300 dark:ring-blue-800' : ''}`}>
      <div className="min-w-0">
        <h3 className="font-semibold">
          {m.name} {own && <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">Siz</span>}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">{machineLine(m) || 'Ayrıntı girilmemiş'}</p>
        <p className="mt-1 text-sm">
          🏭 <b>{m.shop.name}</b>
          <span className="text-slate-500"> · {[m.shop.district, m.shop.province].filter(Boolean).join(', ')}</span>
        </p>
      </div>
      {!own && <Contact phone={m.shop.phone} email={m.shop.email} />}
    </article>
  );
}

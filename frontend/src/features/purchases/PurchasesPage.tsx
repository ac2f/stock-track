import { Can } from '../../components/Can';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  createPurchase,
  fetchPurchases,
  type CreatePurchaseInput,
  type PurchaseItemInput,
} from '../../api/purchases.api';
import {
  createSupplier,
  deleteSupplier,
  updateSupplier,
  type Supplier,
  type SupplierInput,
} from '../../api/suppliers.api';
import {
  fetchPlates,
  upsertPlatePrice,
  type SupplierPriceUnit,
} from '../../api/materials.api';
import { SearchSelect } from '../../components/SearchSelect';
import { Pagination } from '../../components/Pagination';
import { usePageSize } from '../../hooks/usePageSize';
import { useDebounced } from '../../hooks/useDebounced';
import { useSuppliers } from '../../hooks/useReferenceData';
import { mapLimit } from '../../lib/concurrency';
import { GroupSection } from '../../components/GroupSection';
import { confirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { useAuth } from '../../context/AuthContext';
import { useUrlParam } from '../../hooks/useUrlParam';
import { formatDate, formatMoney, formatNumber } from '../../lib/format';
import type { Plate } from '../../types';

function Field({
  label,
  children,
  className = '',
  required = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="label">
        {label}
        {required && (
          <span className="text-red-600" aria-hidden>
            {' '}
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function errMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? fallback
  );
}

/** Formların üstündeki kırmızı hata kutusu. */
function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
    >
      {children}
    </p>
  );
}

/** Alım birim fiyatının tedarikçi fiyat listesindeki birimi (malzeme türüne göre). */
function priceUnitFor(plate?: Plate): SupplierPriceUnit {
  switch (plate?.measurementType) {
    case 'length':
      return 'per_meter';
    case 'weight':
      return 'per_kg';
    default:
      return 'per_plate';
  }
}

/**
 * Alım kalemi için malzeme seçici: arama sunucuda yapılır (yazma bitince),
 * liste yalnız açıkken istenir — ilk 100 kalemle sınırlı kalmaz.
 */
function PurchasePlatePicker({
  value,
  selected,
  onPick,
}: {
  value: string;
  selected?: Plate;
  onPick: (id: string, plate?: Plate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const search = useDebounced(term.trim());
  const { data, isFetching } = useQuery({
    queryKey: ['plates', 'purchase-pick', search],
    queryFn: () => fetchPlates({ search: search || undefined, page: 1, limit: 100 }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const items = data?.items ?? [];
  // Seçili malzeme listede yoksa da adı görünsün.
  const list = selected && !items.some((p) => p.id === selected.id) ? [selected, ...items] : items;
  return (
    <SearchSelect
      placeholder="Malzeme/plaka ara/seç…"
      value={value}
      options={list.map((p) => ({
        id: p.id,
        label: p.name,
        group: p.template?.category?.name ?? 'Diğer',
      }))}
      filterLocally={false}
      loading={isFetching}
      stale={term.trim() !== search || isFetching}
      onSearchChange={setTerm}
      onOpenChange={setOpen}
      onChange={(id) => onPick(id, list.find((p) => p.id === id))}
    />
  );
}

/** ➕ Yeni alım formu — kalemler kaydedilince stok AYNI anda girer. */
function NewPurchaseForm({
  onDone,
  onCancel,
  onNewSupplier,
}: {
  onDone: () => void;
  onCancel: () => void;
  /** Tedarikçi yoksa: tedarikçi formunu açar. */
  onNewSupplier: () => void;
}) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState('');
  const [recordPrices, setRecordPrices] = useState(true);
  const [items, setItems] = useState<PurchaseItemInput[]>([
    { plateId: '', quantity: 1, unitPrice: 0 },
  ]);

  const { data: suppliers } = useSuppliers();
  // Seçilen malzemeler (ölçü birimi ve fiyat listesi birimi için).
  const [picked, setPicked] = useState<Record<string, Plate>>({});
  const plateOf = (id: string): Plate | undefined => picked[id];

  const patch = (i: number, p: Partial<PurchaseItemInput>) =>
    setItems((it) => it.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  const total = items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const canSubmit =
    supplierId &&
    items.length > 0 &&
    items.every((it) => it.plateId && it.quantity > 0);

  const mut = useMutation({
    mutationFn: async (input: CreatePurchaseInput) => {
      const order = await createPurchase(input);
      // Alım fiyatını tedarikçi fiyat listesine işle (teklifteki karşılaştırma
      // buradan beslenir). Best-effort: fiyat kaydı başarısız olsa da alım kaydı
      // ve stok girişi tamamlanmıştır.
      // İstekler en çok 4'er 4'er gider; başarısız olan yok sayılır (liste
      // fiyatı elle de girilebilir).
      if (recordPrices) {
        // Aynı malzeme iki kalemdeyse son kalemin fiyatı geçerli (sırayla
        // yazmadaki gibi); aynı fiyat kaydına eşzamanlı yazılmaz.
        const lastByPlate = [...new Map(input.items.map((it) => [it.plateId, it])).values()];
        await mapLimit(lastByPlate, 4, (it) =>
          upsertPlatePrice(it.plateId, {
            supplierId: input.supplierId,
            price: it.unitPrice,
            unit: priceUnitFor(plateOf(it.plateId)),
          }),
        );
      }
      return order;
    },
    onSuccess: () => onDone(),
    // Alım (kısmen de olsa) yazılmış olabilir: sonuç ne olursa olsun tazele.
    // Alış maliyeti, fiyat önerisi ve tedarikçi fiyat listeleri de değişir.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
      qc.invalidateQueries({ queryKey: ['plate-costs'] });
      qc.invalidateQueries({ queryKey: ['plate-pricing'] });
      qc.invalidateQueries({ queryKey: ['plate-prices'] });
      qc.invalidateQueries({ queryKey: ['price-compare'] });
      qc.invalidateQueries({ queryKey: ['price-rules'] });
    },
  });

  const noSuppliers = suppliers !== undefined && suppliers.length === 0;

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Yeni alım</h2>
        <p className="text-xs text-slate-500">
          Kaydettiğinizde kalemler stoğa aynı anda girer.
        </p>
      </div>

      {mut.isError && <ErrorBox>{errMessage(mut.error, 'Alım kaydedilemedi.')}</ErrorBox>}

      {noSuppliers && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <span>Alım girmek için önce bir tedarikçi ekleyin.</span>
          <button type="button" className="btn-secondary btn-sm" onClick={onNewSupplier}>
            Tedarikçi ekle
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Tedarikçi" required>
          <select
            className="input"
            autoFocus
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Tedarikçi seç…</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Alım tarihi">
          <input
            className="input"
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
          />
        </Field>
        <Field label="Not (ops.)">
          <input
            className="input"
            placeholder="İrsaliye no vb."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-2">
        {items.map((it, i) => {
          const plate = plateOf(it.plateId);
          const isLength = plate?.measurementType === 'length';
          const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
          return (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500">Kalem {i + 1}</span>
                <button
                  type="button"
                  className="btn-danger-soft btn-sm"
                  aria-label={`Kalem ${i + 1} sil`}
                  onClick={() => setItems((arr) => arr.filter((_, idx) => idx !== i))}
                >
                  Sil
                </button>
              </div>
              <PurchasePlatePicker
                value={it.plateId}
                selected={plate}
                onPick={(id, p) => {
                  if (p) setPicked((m) => ({ ...m, [id]: p }));
                  patch(i, { plateId: id });
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field label={isLength ? 'Uzunluk (metre)' : 'Adet'} required>
                  <input
                    className="input text-right tabular-nums"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={isLength ? '0.01' : '1'}
                    value={it.quantity}
                    onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
                  />
                </Field>
                <Field label={isLength ? 'Birim alış fiyatı (TL/m)' : 'Birim alış fiyatı'}>
                  <input
                    className="input text-right tabular-nums"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={it.unitPrice}
                    onChange={(e) => patch(i, { unitPrice: Number(e.target.value) })}
                  />
                </Field>
              </div>
              {lineTotal > 0 && (
                <p className="text-right text-xs text-slate-500">
                  Kalem tutarı:{' '}
                  <span className="font-semibold tabular-nums text-slate-700">{formatMoney(lineTotal)}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="btn-secondary"
        onClick={() =>
          setItems((arr) => [...arr, { plateId: '', quantity: 1, unitPrice: 0 }])
        }
      >
        + Kalem ekle
      </button>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={recordPrices}
          onChange={(e) => setRecordPrices(e.target.checked)}
        />
        Alış fiyatlarını tedarikçi fiyat listesine işle (teklif karşılaştırmasını besler)
      </label>

      <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2">
        <span className="text-sm font-medium text-slate-600">Toplam</span>
        <span className="text-lg font-bold tabular-nums">{formatMoney(total)}</span>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          className="btn-primary sm:min-w-[14rem]"
          disabled={!canSubmit || mut.isPending}
          onClick={() =>
            mut.mutate({
              supplierId,
              purchaseDate,
              note: note.trim() || undefined,
              items,
            })
          }
        >
          {mut.isPending ? 'Kaydediliyor…' : 'Alımı kaydet (stok girer)'}
        </button>
      </div>
    </div>
  );
}

/** Tedarikçi yönetimi (ekle/düzenle/sil). */
function SuppliersSection({ newRequest }: { newRequest: number }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SupplierInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  const { data: suppliers, isLoading } = useSuppliers();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['suppliers'] });

  const createMut = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      invalidate();
      setForm(null);
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SupplierInput> }) =>
      updateSupplier(id, input),
    onSuccess: () => {
      invalidate();
      setForm(null);
      setEditingId(null);
    },
  });
  const deleteMut = useMutation({ mutationFn: deleteSupplier, onSuccess: invalidate });

  const err = createMut.error ?? updateMut.error ?? deleteMut.error;

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '' });
  };
  // Başka yerden (alım formu, boş liste) "tedarikçi ekle" istenirse formu aç.
  useEffect(() => {
    if (!newRequest) return;
    openNew();
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newRequest]);

  const empty = suppliers !== undefined && suppliers.length === 0;
  const busy = createMut.isPending || updateMut.isPending;

  return (
    <div ref={sectionRef} className="scroll-mt-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-600">
          Tedarikçiler
          {!!suppliers?.length && (
            <span className="ml-1.5 font-normal text-slate-500">({suppliers.length})</span>
          )}
        </h2>
        {!form && !empty && (
          <button className="btn-secondary btn-sm" onClick={openNew}>
            + Yeni Tedarikçi
          </button>
        )}
      </div>

      {err && <ErrorBox>{errMessage(err, 'İşlem başarısız.')}</ErrorBox>}

      {form && (
        <div className="card space-y-3">
          <h3 className="font-semibold">{editingId ? 'Tedarikçiyi düzenle' : 'Yeni tedarikçi'}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Ad / Ünvan" required>
              <input
                className="input"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Yetkili (ops.)">
              <input
                className="input"
                value={form.contactName ?? ''}
                onChange={(e) =>
                  setForm({ ...form, contactName: e.target.value || undefined })
                }
              />
            </Field>
            <Field label="Telefon (ops.)">
              <input
                className="input"
                type="tel"
                inputMode="tel"
                value={form.phone ?? ''}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value || undefined })
                }
              />
            </Field>
            <Field label="Not (ops.)">
              <input
                className="input"
                value={form.notes ?? ''}
                onChange={(e) =>
                  setForm({ ...form, notes: e.target.value || undefined })
                }
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={!form.name.trim() || busy}
              onClick={() =>
                editingId
                  ? updateMut.mutate({ id: editingId, input: form })
                  : createMut.mutate(form)
              }
            >
              {editingId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setForm(null);
                setEditingId(null);
              }}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {isLoading && <LoadingBlock rows={1} />}

      {suppliers?.map((s: Supplier) => {
        const contact = [s.contactName, s.phone].filter(Boolean).join(' · ');
        return (
          <div key={s.id} className="card flex flex-wrap items-center justify-between gap-2 !p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{s.name}</p>
              {contact && <p className="truncate text-xs text-slate-500">{contact}</p>}
            </div>
            <div className="flex gap-2">
              <button
                className="btn-secondary btn-sm"
                onClick={() => {
                  setEditingId(s.id);
                  setForm({
                    name: s.name,
                    contactName: s.contactName,
                    phone: s.phone,
                    notes: s.notes,
                  });
                  sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                Düzenle
              </button>
              <button
                className="btn-danger-soft btn-sm"
                aria-label={`"${s.name}" tedarikçisini sil`}
                disabled={deleteMut.isPending}
                onClick={async () => {
                  if (
                    await confirmDialog({
                      message: `"${s.name}" silinsin mi?`,
                      confirmText: 'Sil',
                      danger: true,
                    })
                  )
                    deleteMut.mutate(s.id);
                }}
              >
                Sil
              </button>
            </div>
          </div>
        );
      })}
      {empty && !form && (
        <EmptyState
          compact
          icon="🏭"
          title="Henüz tedarikçi yok"
          hint="Alım girmek için önce malzemeyi aldığınız firmayı tedarikçi olarak ekleyin. Alış fiyatları da bu tedarikçiye işlenir."
          action={
            <button className="btn-secondary" onClick={openNew}>
              + Yeni Tedarikçi
            </button>
          }
        />
      )}
    </div>
  );
}

/**
 * 🛒 Satın Alma: tedarikçiden alım girişi (stok otomatik girer), alım geçmişi
 * ve tedarikçi yönetimi. Alış fiyatları tedarikçi fiyat listesine işlenebilir.
 */
export function PurchasesPage() {
  const { can } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [supplierReq, setSupplierReq] = useState(0);
  // Alım geçmişi sayfalı (eskiden yalnız son 50 alım görünüyordu).
  const [pageSize, setPageSize] = usePageSize('purchases', 20);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['purchases', page, pageSize],
    queryFn: () => fetchPurchases({ page, limit: pageSize }),
    placeholderData: keepPreviousData,
  });
  // Boş durum mesajı için: tedarikçi var mı? (Aynı sorgu, önbellekten gelir.)
  const { data: suppliers } = useSuppliers();

  // Hızlı aramadan /purchases?new=1 ile gelinirse yeni alım formunu aç.
  useUrlParam('new', () => {
    if (can('purchases', 'write')) setShowForm(true);
  });

  // Tedarikçiye göre grupla (renkli grup başlıklarıyla).
  const groups = new Map<string, NonNullable<typeof data>['items']>();
  for (const o of data?.items ?? []) {
    const key = o.supplier?.name ?? '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }
  const noSuppliers = suppliers !== undefined && suppliers.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Satın Alma"
        icon="🛒"
        subtitle="Tedarikçiden alımı girin; kalemler kaydedilince stok aynı anda girer."
        actions={
          <Can module="purchases" level="write">
            {showForm ? (
              <button className="btn-secondary" onClick={() => setShowForm(false)}>
                Kapat
              </button>
            ) : (
              <button
                className="btn-primary"
                data-hotkey="n"
                title="Yeni alım (N)"
                onClick={() => setShowForm(true)}
              >
                + Yeni Alım
              </button>
            )}
          </Can>
        }
      />

      {showForm && (
        <NewPurchaseForm
          onDone={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
          onNewSupplier={() => setSupplierReq((n) => n + 1)}
        />
      )}

      <SuppliersSection newRequest={supplierReq} />

      <div className="flex items-baseline justify-between gap-2 pt-2">
        <h2 className="text-sm font-semibold text-slate-600">Alım geçmişi</h2>
        {!!data?.items.length && (
          <span className="text-xs text-slate-500">{data.meta?.total ?? data.items.length} alım</span>
        )}
      </div>
      {isLoading && <LoadingBlock rows={2} />}
      {[...groups.entries()].map(([supplierName, orders]) => (
        <GroupSection
          key={supplierName}
          title={supplierName}
          count={orders.length}
          countLabel="alım"
        >
          {orders.map((o) => (
            <div key={o.id} className="card space-y-2 !p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tabular-nums">{formatDate(o.purchaseDate?.slice(0, 10))}</p>
                  {o.note && <p className="break-words text-xs text-slate-500">{o.note}</p>}
                </div>
                <span className="shrink-0 text-right text-base font-bold tabular-nums">
                  {formatMoney(o.totalAmount)}
                </span>
              </div>
              <ul className="divide-y divide-slate-100 border-t border-slate-100 text-xs text-slate-600">
                {o.items.map((it, idx) => (
                  <li key={idx} className="flex items-start justify-between gap-3 py-1.5">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-700">{it.plate?.name ?? '—'}</span>
                      <span className="block text-slate-500 tabular-nums">
                        {formatNumber(it.quantity)}
                        {it.plate?.measurementType === 'length' ? ' m' : ' adet'} ×{' '}
                        {formatMoney(it.unitPrice)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-medium tabular-nums">
                      {formatMoney(it.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </GroupSection>
      ))}
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
      {!isLoading && !data?.items.length && (data?.meta?.page ?? 1) === 1 && (
        <EmptyState
          icon="📦"
          title="Henüz alım kaydı yok."
          hint={
            noSuppliers
              ? 'Önce yukarıdan bir tedarikçi ekleyin; sonra sağ üstteki düğmeyle ilk alımı girin. Kalemler kaydedilince stoğa kendiliğinden girer.'
              : 'Tedarikçiden aldığınız malzemeyi girdiğinizde stok aynı anda güncellenir ve alış fiyatı tedarikçi listesine işlenir.'
          }
          action={
            !noSuppliers && !showForm ? (
              <Can module="purchases" level="write">
                <button className="btn-secondary" onClick={() => setShowForm(true)}>
                  İlk alımı gir
                </button>
              </Can>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

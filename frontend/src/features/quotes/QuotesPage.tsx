import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  convertQuote,
  createQuote,
  fetchQuotes,
  setQuoteStatus,
  type CreateQuoteInput,
  type QuoteFilters,
} from '../../api/quotes.api';
import { fetchCustomers } from '../../api/customers.api';
import {
  comparePrices,
  fetchMaterialCategories,
  fetchPlates,
} from '../../api/materials.api';
import { downloadFile, openPdf } from '../../api/documents.api';
import { plateLabel } from '../../lib/plateLabel';
import type { QuoteItemInput, QuoteStatus } from '../../types';

const money = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

const STATUS: Record<QuoteStatus, { label: string; cls: string }> = {
  draft: { label: 'Taslak', cls: 'bg-slate-100 text-slate-600' },
  sent: { label: 'Gönderildi', cls: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Kabul', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Red', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Süresi doldu', cls: 'bg-amber-100 text-amber-700' },
  converted: { label: 'Dönüştürüldü', cls: 'bg-slate-900 text-white' },
};

export function QuotesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState<QuoteFilters>({ page: 1, limit: 50 });

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', filters],
    queryFn: () => fetchQuotes(filters),
  });
  // Filtre açılır listeleri için müşteri ve tür (kategori) listeleri.
  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => fetchCustomers({ page: 1, limit: 100, sort: 'name' }),
  });
  const { data: categories } = useQuery({
    queryKey: ['material-categories'],
    queryFn: fetchMaterialCategories,
  });

  const setFilter = (patch: Partial<QuoteFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const hasFilter = !!(
    filters.buyerCustomerId ||
    filters.status ||
    filters.categoryId ||
    filters.from ||
    filters.to
  );

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatus }) =>
      setQuoteStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const convertMut = useMutation({
    mutationFn: (id: string) => convertQuote(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
      const parts: string[] = [];
      if (res.saleId) parts.push('satış oluşturuldu');
      if (res.processingJobIds.length)
        parts.push(`${res.processingJobIds.length} işleme kuyruğa eklendi`);
      setConvertMsg(
        parts.length
          ? `Dönüştürüldü: ${parts.join(' · ')}.`
          : 'Teklif dönüştürüldü.',
      );
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Teklifler</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Kapat' : '+ Yeni Teklif'}
        </button>
      </div>

      {convertMsg && (
        <div className="card flex items-center justify-between bg-emerald-50 text-sm text-emerald-800">
          <span>{convertMsg}</span>
          <button className="text-emerald-700 underline" onClick={() => setConvertMsg(null)}>
            Kapat
          </button>
        </div>
      )}
      {convertMut.isError && (
        <div className="card text-sm text-red-600">
          {(convertMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Dönüştürme başarısız.'}
        </div>
      )}

      {/* Geçmiş teklif filtresi — tarih aralığı, müşteri, malzeme. */}
      <div className="card space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Başlangıç tarihi</span>
            <input
              className="input"
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => setFilter({ from: e.target.value || undefined })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Bitiş tarihi</span>
            <input
              className="input"
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => setFilter({ to: e.target.value || undefined })}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Müşteri</span>
            <select
              className="input"
              value={filters.buyerCustomerId ?? ''}
              onChange={(e) => setFilter({ buyerCustomerId: e.target.value || undefined })}
            >
              <option value="">Tümü</option>
              {customers?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">Malzeme türü</span>
            <select
              className="input"
              value={filters.categoryId ?? ''}
              onChange={(e) => setFilter({ categoryId: e.target.value || undefined })}
            >
              <option value="">Tümü</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {hasFilter
              ? 'Filtre uygulanıyor · karara bağlanmamış teklifler en üstte'
              : 'Filtre yok · son 1 hafta gösteriliyor'}
          </span>
          {hasFilter && (
            <button
              className="text-slate-500 underline"
              onClick={() => setFilters({ page: 1, limit: 50 })}
            >
              Filtreyi temizle
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <NewQuoteForm
          onDone={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['quotes'] });
          }}
        />
      )}

      {isLoading ? (
        <p className="text-slate-400">Yükleniyor…</p>
      ) : (
        <div className="space-y-2">
          {data?.items.map((q) => (
            <div key={q.id} className="card space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{q.quoteNo}</p>
                  <p className="text-sm text-slate-500">
                    {q.buyerCustomer?.name ?? '—'} · {q.items.length} kalem
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS[q.status].cls}`}
                  >
                    {STATUS[q.status].label}
                  </span>
                  <p className="mt-1 font-semibold">{money.format(q.total)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(q.status === 'draft' || q.status === 'sent') && (
                  <>
                    <button
                      className="btn bg-emerald-600 text-white"
                      onClick={() =>
                        statusMut.mutate({ id: q.id, status: 'accepted' })
                      }
                    >
                      Kabul
                    </button>
                    <button
                      className="btn bg-slate-100"
                      onClick={() =>
                        statusMut.mutate({ id: q.id, status: 'rejected' })
                      }
                    >
                      Reddet
                    </button>
                  </>
                )}
                {q.status === 'accepted' && (
                  <button
                    className="btn-primary"
                    disabled={convertMut.isPending}
                    onClick={() => convertMut.mutate(q.id)}
                  >
                    Satış/İşlemeye Dönüştür
                  </button>
                )}
                <button
                  className="btn bg-slate-100"
                  onClick={() => openPdf(`/quotes/${q.id}/print`)}
                >
                  Yazdır / PDF
                </button>
                <button
                  className="btn bg-slate-100"
                  onClick={() =>
                    downloadFile(`/quotes/${q.id}/csv`, `teklif-${q.quoteNo}.csv`)
                  }
                >
                  CSV
                </button>
              </div>
            </div>
          ))}
          {!data?.items.length && (
            <p className="text-slate-400">Henüz teklif yok.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AveragePriceNote({ plateId }: { plateId: string }) {
  const { data } = useQuery({
    queryKey: ['price-compare', plateId],
    queryFn: () => comparePrices(plateId),
    enabled: !!plateId,
  });
  if (!data?.average) return null;
  return (
    <p className="text-xs text-slate-400">
      Ortalama tedarikçi fiyatı: {data.average.amount} {data.average.currency}
    </p>
  );
}

/** Etiketli form alanı sarmalayıcısı — her input'un ne ifade ettiği açıkça görünsün. */
function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function NewQuoteForm({ onDone }: { onDone: () => void }) {
  const [buyerCustomerId, setBuyer] = useState('');
  const [items, setItems] = useState<QuoteItemInput[]>([]);
  // Satış kaleminde malzeme seçilince "işleme kalemi olarak da ekleyelim mi?" sorusu.
  const [askFor, setAskFor] = useState<{ index: number; plateId: string } | null>(null);

  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => fetchCustomers({ page: 1, limit: 100, sort: 'name' }),
  });
  const { data: plates } = useQuery({
    queryKey: ['plates', 'all'],
    queryFn: () => fetchPlates({ page: 1, limit: 100 }),
  });

  const createMut = useMutation({
    mutationFn: (input: CreateQuoteInput) => createQuote(input),
    onSuccess: onDone,
  });

  const addItem = (lineKind: 'sale' | 'processing') =>
    setItems((it) => [
      ...it,
      lineKind === 'sale'
        ? { lineKind, plateId: '', quantity: 1, unitPrice: 0, stockSource: 'business' }
        : { lineKind, plateId: '', quantity: 1, unitPrice: 0, billingUnit: 'area' },
    ]);

  // Aynı malzemeyi işleme kalemi olarak ekler (satış kalemindeki soruya "Evet" yanıtı).
  const addProcessingForPlate = (plateId: string) =>
    setItems((it) => [
      ...it,
      { lineKind: 'processing', plateId, quantity: 1, unitPrice: 0, billingUnit: 'area' },
    ]);

  const patch = (i: number, p: Partial<QuoteItemInput>) =>
    setItems((it) => it.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const remove = (i: number) =>
    setItems((it) => it.filter((_, idx) => idx !== i));

  // Satış kaleminde malzeme seçimi: seçilince işleme-kalemi sorusunu tetikle.
  const onSalePlateChange = (i: number, lineKind: QuoteItemInput['lineKind'], plateId: string) => {
    patch(i, { plateId });
    if (lineKind === 'sale') {
      setAskFor(plateId ? { index: i, plateId } : null);
    }
  };

  const canSubmit =
    buyerCustomerId && items.length > 0 && items.every((i) => i.plateId);

  return (
    <div className="card space-y-3">
      <Field label="Alıcı müşteri">
        <select
          className="input"
          value={buyerCustomerId}
          onChange={(e) => setBuyer(e.target.value)}
        >
          <option value="">Müşteri seçin…</option>
          {customers?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-2 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {item.lineKind === 'sale'
                ? 'Satış kalemi (malzeme satışı)'
                : 'İşleme kalemi (kesim/üretim hizmeti)'}
            </span>
            <button className="text-red-600" onClick={() => remove(i)}>
              Sil
            </button>
          </div>
          <Field label="Malzeme / plaka">
            <select
              className="input"
              value={item.plateId}
              onChange={(e) => onSalePlateChange(i, item.lineKind, e.target.value)}
            >
              <option value="">Malzeme/plaka seçin…</option>
              {plates?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {plateLabel(p)}
                </option>
              ))}
            </select>
          </Field>

          {item.lineKind === 'sale' &&
            askFor &&
            askFor.index === i &&
            askFor.plateId === item.plateId && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 p-2 text-sm">
                <span className="text-blue-900">
                  Bu malzemeyi işleme (kesim/üretim) kalemi olarak da ekleyelim mi?
                </span>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn bg-blue-600 text-white"
                    onClick={() => {
                      addProcessingForPlate(item.plateId);
                      setAskFor(null);
                    }}
                  >
                    Evet, ekle
                  </button>
                  <button className="btn bg-slate-100" onClick={() => setAskFor(null)}>
                    Hayır
                  </button>
                </div>
              </div>
            )}

          <div className="flex gap-2">
            <Field label="Adet" className="flex-1">
              <input
                className="input"
                type="number"
                placeholder="Adet"
                value={item.quantity}
                onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
              />
            </Field>
            <Field
              label={item.lineKind === 'sale' ? 'Birim satış fiyatı' : 'Birim işleme ücreti'}
              className="flex-1"
            >
              <input
                className="input"
                type="number"
                value={item.unitPrice}
                onChange={(e) => patch(i, { unitPrice: Number(e.target.value) })}
              />
            </Field>
          </div>
          {item.lineKind === 'sale' && item.plateId && (
            <AveragePriceNote plateId={item.plateId} />
          )}
          {/* #11 Tabaka (m²) satışında satılacak ebat + "Tamamını sat" */}
          {item.lineKind === 'sale' &&
            (() => {
              const plate = plates?.items.find((p) => p.id === item.plateId);
              if (!plate || plate.measurementType !== 'area') return null;
              return (
                <div className="space-y-1 rounded-lg bg-slate-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      Satılacak ebat (en × boy, mm) — m² üzerinden fiyatlanır
                    </span>
                    <button
                      className="btn bg-slate-200 text-xs"
                      onClick={() =>
                        patch(i, { widthMm: plate.widthMm, heightMm: plate.heightMm })
                      }
                    >
                      Tamamını sat ({plate.widthMm}×{plate.heightMm})
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="input"
                      type="number"
                      placeholder="en (mm)"
                      value={item.widthMm ?? ''}
                      onChange={(e) =>
                        patch(i, { widthMm: e.target.value ? Number(e.target.value) : undefined })
                      }
                    />
                    <input
                      className="input"
                      type="number"
                      placeholder="boy (mm)"
                      value={item.heightMm ?? ''}
                      onChange={(e) =>
                        patch(i, { heightMm: e.target.value ? Number(e.target.value) : undefined })
                      }
                    />
                  </div>
                </div>
              );
            })()}
          {item.lineKind === 'processing' && (
            <div className="flex gap-2">
              <Field label="Faturalama birimi">
                <select
                  className="input w-auto"
                  value={item.billingUnit}
                  onChange={(e) =>
                    patch(i, {
                      billingUnit: e.target.value as QuoteItemInput['billingUnit'],
                    })
                  }
                >
                  <option value="area">m²</option>
                  <option value="length">metre</option>
                  <option value="piece">adet</option>
                </select>
              </Field>
              {item.billingUnit === 'length' && (
                <Field label="Uzunluk (metre)" className="flex-1">
                  <input
                    className="input"
                    type="number"
                    placeholder="metre"
                    value={item.lengthMeters ?? ''}
                    onChange={(e) => patch(i, { lengthMeters: Number(e.target.value) })}
                  />
                </Field>
              )}
              {item.billingUnit === 'area' && (
                <>
                  <Field label="En (mm)" className="flex-1">
                    <input
                      className="input"
                      type="number"
                      placeholder="en (mm)"
                      value={item.widthMm ?? ''}
                      onChange={(e) => patch(i, { widthMm: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Boy (mm)" className="flex-1">
                    <input
                      className="input"
                      type="number"
                      placeholder="boy (mm)"
                      value={item.heightMm ?? ''}
                      onChange={(e) => patch(i, { heightMm: Number(e.target.value) })}
                    />
                  </Field>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button className="btn bg-slate-100" onClick={() => addItem('sale')}>
          + Satış kalemi
        </button>
        <button className="btn bg-slate-100" onClick={() => addItem('processing')}>
          + İşleme kalemi
        </button>
      </div>

      <button
        className="btn-primary w-full"
        disabled={!canSubmit || createMut.isPending}
        onClick={() => createMut.mutate({ buyerCustomerId, currency: 'TRY', items })}
      >
        Teklif Oluştur
      </button>
      {createMut.isError && (
        <p className="text-sm text-red-600">Teklif oluşturulamadı.</p>
      )}
    </div>
  );
}

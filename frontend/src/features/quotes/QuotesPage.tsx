import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  convertQuote,
  createQuote,
  fetchQuotes,
  setQuoteStatus,
  type CreateQuoteInput,
} from '../../api/quotes.api';
import { fetchCustomers } from '../../api/customers.api';
import { fetchPlates } from '../../api/materials.api';
import { openPdf } from '../../api/documents.api';
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
  const { data, isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => fetchQuotes({ page: 1, limit: 50 }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatus }) =>
      setQuoteStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
  const convertMut = useMutation({
    mutationFn: (id: string) => convertQuote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
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
                  onClick={() => openPdf(`/quotes/${q.id}/pdf`)}
                >
                  PDF
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

function NewQuoteForm({ onDone }: { onDone: () => void }) {
  const [buyerCustomerId, setBuyer] = useState('');
  const [items, setItems] = useState<QuoteItemInput[]>([]);

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

  const patch = (i: number, p: Partial<QuoteItemInput>) =>
    setItems((it) => it.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const remove = (i: number) =>
    setItems((it) => it.filter((_, idx) => idx !== i));

  const canSubmit =
    buyerCustomerId && items.length > 0 && items.every((i) => i.plateId);

  return (
    <div className="card space-y-3">
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

      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-2 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{item.lineKind === 'sale' ? 'Satış kalemi' : 'İşleme kalemi'}</span>
            <button className="text-red-600" onClick={() => remove(i)}>
              Sil
            </button>
          </div>
          <select
            className="input"
            value={item.plateId}
            onChange={(e) => patch(i, { plateId: e.target.value })}
          >
            <option value="">Malzeme/plaka seçin…</option>
            {plates?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              className="input"
              type="number"
              placeholder="Adet"
              value={item.quantity}
              onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
            />
            <input
              className="input"
              type="number"
              placeholder={item.lineKind === 'sale' ? 'Birim fiyat' : 'Birim ücret'}
              value={item.unitPrice}
              onChange={(e) => patch(i, { unitPrice: Number(e.target.value) })}
            />
          </div>
          {item.lineKind === 'processing' && (
            <div className="flex gap-2">
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
              {item.billingUnit === 'length' && (
                <input
                  className="input"
                  type="number"
                  placeholder="metre"
                  value={item.lengthMeters ?? ''}
                  onChange={(e) =>
                    patch(i, { lengthMeters: Number(e.target.value) })
                  }
                />
              )}
              {item.billingUnit === 'area' && (
                <>
                  <input
                    className="input"
                    type="number"
                    placeholder="en(mm)"
                    value={item.widthMm ?? ''}
                    onChange={(e) => patch(i, { widthMm: Number(e.target.value) })}
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="boy(mm)"
                    value={item.heightMm ?? ''}
                    onChange={(e) =>
                      patch(i, { heightMm: Number(e.target.value) })
                    }
                  />
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

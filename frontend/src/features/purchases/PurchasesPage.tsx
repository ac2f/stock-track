import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  createPurchase,
  fetchPurchases,
  type CreatePurchaseInput,
  type PurchaseItemInput,
} from '../../api/purchases.api';
import {
  createSupplier,
  deleteSupplier,
  fetchSuppliers,
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
import { GroupSection } from '../../components/GroupSection';
import type { Plate } from '../../types';

const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

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

function errMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? fallback
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

/** ➕ Yeni alım formu — kalemler kaydedilince stok AYNI anda girer. */
function NewPurchaseForm({ onDone }: { onDone: () => void }) {
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

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => fetchSuppliers(),
  });
  const { data: platesData } = useQuery({
    queryKey: ['plates', 'purchase-pick'],
    queryFn: () => fetchPlates({ page: 1, limit: 100 }),
  });
  const plates = platesData?.items ?? [];
  const plateOf = (id: string) => plates.find((p) => p.id === id);

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
      if (recordPrices) {
        for (const it of input.items) {
          try {
            await upsertPlatePrice(it.plateId, {
              supplierId: input.supplierId,
              price: it.unitPrice,
              unit: priceUnitFor(plateOf(it.plateId)),
            });
          } catch {
            // yoksay — liste fiyatı elle de girilebilir
          }
        }
      }
      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
      onDone();
    },
  });

  return (
    <div className="card space-y-3">
      {mut.isError && (
        <p className="text-sm text-red-600">
          {errMessage(mut.error, 'Alım kaydedilemedi.')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Tedarikçi">
          <select
            className="input"
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

      {items.map((it, i) => {
        const plate = plateOf(it.plateId);
        const isLength = plate?.measurementType === 'length';
        return (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-slate-200 p-2 dark:border-slate-700"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Kalem {i + 1}</span>
              <button
                className="text-red-600"
                onClick={() => setItems((arr) => arr.filter((_, idx) => idx !== i))}
              >
                Sil
              </button>
            </div>
            <SearchSelect
              placeholder="Malzeme/plaka ara/seç…"
              value={it.plateId}
              options={plates.map((p) => ({
                id: p.id,
                label: p.name,
                group: p.template?.category?.name ?? 'Diğer',
              }))}
              onChange={(id) => patch(i, { plateId: id })}
            />
            <div className="flex gap-2">
              <Field label={isLength ? 'Uzunluk (metre)' : 'Adet'} className="flex-1">
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={isLength ? '0.01' : '1'}
                  value={it.quantity}
                  onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
                />
              </Field>
              <Field
                label={isLength ? 'Birim alış fiyatı (TL/m)' : 'Birim alış fiyatı'}
                className="flex-1"
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={it.unitPrice}
                  onChange={(e) => patch(i, { unitPrice: Number(e.target.value) })}
                />
              </Field>
            </div>
          </div>
        );
      })}

      <button
        className="btn bg-slate-100"
        onClick={() =>
          setItems((arr) => [...arr, { plateId: '', quantity: 1, unitPrice: 0 }])
        }
      >
        + Kalem ekle
      </button>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={recordPrices}
          onChange={(e) => setRecordPrices(e.target.checked)}
        />
        Alış fiyatlarını tedarikçi fiyat listesine işle (teklif karşılaştırmasını besler)
      </label>

      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Toplam
        </span>
        <span className="text-lg font-bold">{money.format(total)}</span>
      </div>

      <button
        className="btn-primary w-full"
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
        Alımı kaydet (stok girer)
      </button>
    </div>
  );
}

/** Tedarikçi yönetimi (ekle/düzenle/sil). */
function SuppliersSection() {
  const qc = useQueryClient();
  const [form, setForm] = useState<SupplierInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => fetchSuppliers(),
  });
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">Tedarikçiler</h2>
        {!form && (
          <button
            className="btn bg-slate-100 text-xs"
            onClick={() => {
              setEditingId(null);
              setForm({ name: '' });
            }}
          >
            + Yeni Tedarikçi
          </button>
        )}
      </div>

      {err && (
        <p className="card text-sm text-red-600">
          {errMessage(err, 'İşlem başarısız.')}
        </p>
      )}

      {form && (
        <div className="card space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Ad / Ünvan">
              <input
                className="input"
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
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={!form.name.trim()}
              onClick={() =>
                editingId
                  ? updateMut.mutate({ id: editingId, input: form })
                  : createMut.mutate(form)
              }
            >
              {editingId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button
              className="btn"
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

      {suppliers?.map((s: Supplier) => (
        <div key={s.id} className="card flex items-center justify-between !p-2">
          <div className="min-w-0">
            <span className="font-medium">{s.name}</span>
            <span className="ml-2 text-xs text-slate-400">
              {[s.contactName, s.phone].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              className="btn bg-slate-100 text-xs"
              onClick={() => {
                setEditingId(s.id);
                setForm({
                  name: s.name,
                  contactName: s.contactName,
                  phone: s.phone,
                  notes: s.notes,
                });
              }}
            >
              Düzenle
            </button>
            <button
              className="btn bg-red-50 text-xs text-red-600"
              onClick={() => {
                if (confirm(`"${s.name}" silinsin mi?`)) deleteMut.mutate(s.id);
              }}
            >
              Sil
            </button>
          </div>
        </div>
      ))}
      {!suppliers?.length && !form && (
        <p className="text-sm text-slate-400">
          Henüz tedarikçi yok — alım girmek için önce tedarikçi ekleyin.
        </p>
      )}
    </div>
  );
}

/**
 * 🛒 Satın Alma: tedarikçiden alım girişi (stok otomatik girer), alım geçmişi
 * ve tedarikçi yönetimi. Alış fiyatları tedarikçi fiyat listesine işlenebilir.
 */
export function PurchasesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => fetchPurchases({ page: 1, limit: 50 }),
  });

  // Tedarikçiye göre grupla (renkli grup başlıklarıyla).
  const groups = new Map<string, NonNullable<typeof data>['items']>();
  for (const o of data?.items ?? []) {
    const key = o.supplier?.name ?? '—';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Satın Alma</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Kapat' : '+ Yeni Alım'}
        </button>
      </div>

      {showForm && <NewPurchaseForm onDone={() => setShowForm(false)} />}

      <SuppliersSection />

      <h2 className="text-sm font-semibold text-slate-500">Alım geçmişi</h2>
      {[...groups.entries()].map(([supplierName, orders]) => (
        <GroupSection
          key={supplierName}
          title={supplierName}
          count={orders.length}
          countLabel="alım"
        >
          {orders.map((o) => (
            <div key={o.id} className="card space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">
                    {o.purchaseDate?.slice(0, 10)}
                    {o.note ? ` · ${o.note}` : ''}
                  </p>
                </div>
                <span className="font-semibold">
                  {money.format(Number(o.totalAmount))}
                </span>
              </div>
              <ul className="text-xs text-slate-600 dark:text-slate-300">
                {o.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>
                      {it.plate?.name ?? '—'} ·{' '}
                      {Number(it.quantity).toLocaleString('tr-TR')}
                      {it.plate?.measurementType === 'length' ? ' m' : ' adet'} ×{' '}
                      {money.format(Number(it.unitPrice))}
                    </span>
                    <span>{money.format(Number(it.lineTotal))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </GroupSection>
      ))}
      {!data?.items.length && (
        <p className="text-slate-400">Henüz alım kaydı yok.</p>
      )}
    </div>
  );
}

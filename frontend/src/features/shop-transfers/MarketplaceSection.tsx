import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { requestShopTransfer } from '../../api/shop-transfers.api';
import { fetchMarketplace, type MarketListing } from '../../api/trade.api';
import { Pagination } from '../../components/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock } from '../../components/ui/Loading';
import { SearchInput } from '../../components/ui/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';
import { usePageSize } from '../../hooks/usePageSize';
import { formatMoney, formatNumber } from '../../lib/format';
import { apiErrorMessage, toast } from '../../lib/toast';
import {
  alertBox,
  Field,
  infoBox,
  m2Of,
  measureText,
  placeLabel,
  priceUnitLabel,
  useInvalidateAfterTransfer,
} from './shared';

interface CartLine {
  listing: MarketListing;
  quantity: number;
  unitPrice: number;
  widthMm?: number;
  heightMm?: number;
}

const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;

const lineTotal = (l: CartLine): number =>
  l.listing.measurementType === 'area'
    ? m2Of(l.widthMm, l.heightMm, l.quantity || 0) * (l.unitPrice || 0)
    : (l.quantity || 0) * (l.unitPrice || 0);

function lineError(l: CartLine): string | null {
  const { listing } = l;
  if (!(l.quantity > 0)) return 'Miktar girin.';
  if (listing.measurementType === 'area') {
    if (!Number.isInteger(l.quantity)) return 'Parça adedi tam sayı olmalı.';
    if (!(Number(l.widthMm) > 0) || !(Number(l.heightMm) > 0)) return 'Parçanın enini ve boyunu girin.';
    const W = Number(listing.widthMm);
    const H = Number(listing.heightMm);
    if (W && H && (Number(l.widthMm) > W + 1 || Number(l.heightMm) > H + 1)) {
      return `Parça listedeki ebattan (${W}×${H} mm) büyük olamaz.`;
    }
  } else if (l.quantity > listing.quantity + 1e-9) {
    return `En çok ${formatNumber(listing.quantity)} istenebilir.`;
  }
  return null;
}

/** Talep sepeti: tek satıcıya, listedeki kalemlerden. */
function RequestCart({
  cart,
  setCart,
  currency,
  setCurrency,
  onSent,
}: {
  cart: CartLine[];
  setCart: (fn: (c: CartLine[]) => CartLine[]) => void;
  currency: (typeof CURRENCIES)[number];
  setCurrency: (c: (typeof CURRENCIES)[number]) => void;
  onSent: () => void;
}) {
  const invalidate = useInvalidateAfterTransfer();
  const [note, setNote] = useState('');
  const seller = cart[0].listing.shop;
  const total = cart.reduce((s, l) => s + lineTotal(l), 0);
  const valid = cart.every((l) => !lineError(l) && l.unitPrice > 0);
  const patch = (i: number, p: Partial<CartLine>) => setCart((arr) => arr.map((x, idx) => (idx === i ? { ...x, ...p } : x)));

  const mut = useMutation({
    mutationFn: () =>
      requestShopTransfer({
        fromShopId: seller.id,
        currency,
        note: note.trim() || undefined,
        items: cart.map((l) => ({
          plateId: l.listing.plateId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          ...(l.listing.measurementType === 'area' ? { widthMm: l.widthMm, heightMm: l.heightMm } : {}),
        })),
      }),
    onSuccess: (t) => {
      toast.success(
        t.status === 'pending' ? `${t.transferNo} talebi gönderildi` : `${t.transferNo} tamamlandı`,
        t.status === 'pending'
          ? `"${seller.name}" onaylayınca malzeme stoğunuza girer; o zamana kadar stok ve cariniz değişmez.`
          : 'Malzeme stoğunuza girdi.',
      );
      onSent();
    },
    onSettled: invalidate,
  });

  return (
    <div className="card space-y-3 border-2 border-blue-300 dark:border-blue-800">
      <div>
        <h2 className="font-semibold">Alım talebi — {seller.name}</h2>
        <p className="text-xs text-slate-500">
          Talep tek işletmeye gönderilir. {seller.name} onaylarsa malzeme onun stoğundan düşer, sizin stoğunuza girer ve tutar
          ona borcunuz olarak yazılır; reddederse hiçbir kayıt oluşmaz.
        </p>
      </div>
      {mut.isError && (
        <p role="alert" className={alertBox}>
          {apiErrorMessage(mut.error, 'Talep gönderilemedi.')}
        </p>
      )}
      <ul className="space-y-2">
        {cart.map((l, i) => {
          const { listing } = l;
          const area = listing.measurementType === 'area';
          const err = lineError(l);
          return (
            <li key={listing.plateId} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 text-sm">
                  <span className="font-medium">{listing.name}</span>
                  <span className="block text-xs text-slate-500">
                    Listede: {measureText(listing.measurementType, listing.quantity, listing.widthMm, listing.heightMm)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn-danger-soft btn-sm"
                  aria-label={`${listing.name} talepten çıkar`}
                  onClick={() => setCart((arr) => arr.filter((_, idx) => idx !== i))}
                >
                  Çıkar
                </button>
              </div>
              <div className={`grid gap-2 ${area ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
                <Field label={area ? 'Parça adedi' : listing.measurementType === 'length' ? 'Uzunluk (m)' : listing.measurementType === 'weight' ? 'Ağırlık (kg)' : 'Adet'}>
                  <input
                    className="input text-right tabular-nums"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={area || listing.measurementType === 'piece' ? '1' : '0.01'}
                    value={l.quantity}
                    onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
                  />
                </Field>
                {area && (
                  <>
                    <Field label="En (mm)">
                      <input
                        className="input text-right tabular-nums"
                        type="number"
                        inputMode="decimal"
                        min={1}
                        value={l.widthMm ?? ''}
                        onChange={(e) => patch(i, { widthMm: Number(e.target.value) || undefined })}
                      />
                    </Field>
                    <Field label="Boy (mm)">
                      <input
                        className="input text-right tabular-nums"
                        type="number"
                        inputMode="decimal"
                        min={1}
                        value={l.heightMm ?? ''}
                        onChange={(e) => patch(i, { heightMm: Number(e.target.value) || undefined })}
                      />
                    </Field>
                  </>
                )}
                <Field label={`Birim fiyat (${priceUnitLabel(listing.measurementType).replace('TL', currency)})`}>
                  <input
                    className="input text-right tabular-nums"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={l.unitPrice}
                    onChange={(e) => patch(i, { unitPrice: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {listing.retailPrice != null
                    ? `Liste fiyatı: ${formatMoney(listing.retailPrice, listing.retailCurrency)}`
                    : 'Liste fiyatı yok: teklif ettiğiniz fiyatı girin.'}
                </span>
                {lineTotal(l) > 0 && (
                  <span>
                    Kalem tutarı: <span className="font-semibold tabular-nums text-slate-700">{formatMoney(lineTotal(l), currency)}</span>
                  </span>
                )}
              </div>
              {err && <p className="text-xs font-medium text-red-600">{err}</p>}
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Para birimi">
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value as (typeof CURRENCIES)[number])}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Not (ops.)" className="sm:col-span-2">
          <input className="input" maxLength={500} placeholder="Teslim şekli, acil mi vb." value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
        <span className="text-sm font-medium text-slate-600">Toplam</span>
        <span className="text-lg font-bold tabular-nums">{formatMoney(total, currency)}</span>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={() => setCart(() => [])}>
          Talebi boşalt
        </button>
        <button type="button" className="btn-primary sm:min-w-[14rem]" disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Gönderiliyor…' : `"${seller.name}" işletmesine talep gönder`}
        </button>
      </div>
    </div>
  );
}

/**
 * Pazar yeri: diğer işletmelerin BU işletmeye "bende var, satıyorum" diye listelediği stok.
 * Yalnız ad, ebat, adet ve (varsa) liste fiyatı görünür; maliyet, müşteri ve alış bilgisi hiç paylaşılmaz.
 */
export function MarketplaceSection({ onSent }: { onSent: () => void }) {
  const { can, shop } = useAuth();
  const canRequest = can('purchases', 'write');
  const [term, setTerm] = useState('');
  const search = useDebounced(term.trim());
  const [shopFilter, setShopFilter] = useState<{ id: string; name: string } | null>(null);
  const [pageSize, setPageSize] = usePageSize('marketplace', 20);
  const [page, setPage] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('TRY');
  useEffect(() => setPage(1), [search, shopFilter?.id]);
  // İşletme değişince sepet başka işletmeye ait kalmasın.
  useEffect(() => setCart([]), [shop?.id]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['marketplace', shop?.id, search, shopFilter?.id, page, pageSize],
    queryFn: () => fetchMarketplace({ search: search || undefined, shopId: shopFilter?.id, page, limit: pageSize }),
    placeholderData: keepPreviousData,
  });

  const cartShopId = cart[0]?.listing.shop.id;
  const add = (listing: MarketListing) => {
    if (cart.some((c) => c.listing.plateId === listing.plateId)) return;
    if (cartShopId && cartShopId !== listing.shop.id) {
      toast.error('Talep tek işletmeye gönderilir', `Önce "${cart[0].listing.shop.name}" talebini gönderin ya da boşaltın.`);
      return;
    }
    const area = listing.measurementType === 'area';
    setCart((c) => [
      ...c,
      {
        listing,
        quantity: area ? 1 : Math.min(1, listing.quantity) || 1,
        // Liste fiyatı yalnız aynı para biriminde hazır gelir; aksi hâlde alıcı kendisi yazar.
        unitPrice: listing.retailPrice != null && listing.retailCurrency === currency ? listing.retailPrice : 0,
        widthMm: area ? listing.widthMm ?? undefined : undefined,
        heightMm: area ? listing.heightMm ?? undefined : undefined,
      },
    ]);
  };

  // Aynı işletmenin kalemleri art arda geldiği için başlıklar işletme değişince açılır.
  let lastShop = '';

  return (
    <div className="space-y-3">
      <p className={infoBox}>
        Burada diğer işletmelerin sizinle paylaştığı "bende var" stokları görünür. Kalemi talebe ekleyip gönderirsiniz;
        satıcı onaylayınca malzeme stoğunuza girer.
      </p>

      {cart.length > 0 && canRequest && (
        <RequestCart cart={cart} setCart={setCart} currency={currency} setCurrency={setCurrency} onSent={() => { setCart([]); onSent(); }} />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput className="sm:w-80" value={term} onChange={setTerm} placeholder="Malzeme, marka, renk ya da işletme ara…" />
        {shopFilter && (
          <button type="button" className="badge bg-blue-100 text-blue-800" onClick={() => setShopFilter(null)} title="Süzgeci kaldır">
            {shopFilter.name} ✕
          </button>
        )}
      </div>

      {isLoading && <LoadingBlock rows={3} />}
      {isError && (
        <p role="alert" className="text-sm text-red-600">
          {apiErrorMessage(error, 'Liste alınamadı.')}
        </p>
      )}

      <ul className="space-y-2">
        {data?.items.map((l) => {
          const header = l.shop.id !== lastShop;
          lastShop = l.shop.id;
          const inCart = cart.some((c) => c.listing.plateId === l.plateId);
          return (
            <li key={l.plateId} data-listing={l.name}>
              {header && (
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                  <button type="button" className="underline decoration-dotted" onClick={() => setShopFilter({ id: l.shop.id, name: l.shop.name })} title="Yalnız bu işletmeyi göster">
                    {l.shop.name}
                  </button>
                  {placeLabel(l.shop) && <span className="text-xs font-normal text-slate-500">{placeLabel(l.shop)}</span>}
                </p>
              )}
              <div className="card flex flex-wrap items-center justify-between gap-2 !p-3">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{l.name}</span>
                  {l.categoryName && <span className="text-slate-400"> · {l.categoryName}</span>}
                  <span className="block text-xs tabular-nums text-slate-500">
                    {measureText(l.measurementType, l.quantity, l.widthMm, l.heightMm)}
                    {l.retailPrice != null && <> · Liste: {formatMoney(l.retailPrice, l.retailCurrency)}{l.measurementType === 'area' ? '/m²' : ''}</>}
                  </span>
                </div>
                {canRequest && (
                  <button type="button" className={inCart ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} disabled={inCart} onClick={() => add(l)}>
                    {inCart ? 'Talepte' : 'Talebe ekle'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

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
          icon="🛍️"
          title={search || shopFilter ? 'Aramaya uyan paylaşılmış stok yok.' : 'Henüz sizinle paylaşılmış stok yok.'}
          hint={
            search || shopFilter
              ? undefined
              : 'Diğer işletmeler "Bende var" bölümünden stoklarını herkese ya da yalnız yetki verdiklerine açtığında burada listelenir.'
          }
        />
      )}
      {!canRequest && (
        <p className="text-xs text-slate-500">Talep göndermek için bu işletmede satın alma yazma izniniz olmalı.</p>
      )}
    </div>
  );
}

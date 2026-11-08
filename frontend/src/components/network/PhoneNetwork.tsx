import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  fetchCustomerWarnings,
  lookupPhone,
  type DebtBucket,
  type DebtWarning,
  type PhoneLookup,
} from '../../api/customerNetwork.api';
import { useAuth } from '../../context/AuthContext';
import { useDebounced } from '../../hooks/useDebounced';

/** Telefondaki rakam sayısı: eşleştirme için en az 7. */
export const phoneDigits = (p: string | undefined | null): number => (p ?? '').replace(/\D/g, '').length;

/**
 * Müşteri formunda telefon yazılırken (yazma bitince) diğer işletmelerdeki
 * eşleşmeyi sorar: bilgi önerisi + borç uyarıları. Hata (ağ yok, hız sınırı,
 * ağa katılmama) formu ASLA engellemez; sonuç yoksa sessizce boş döner.
 */
export function usePhoneLookup(phone: string | undefined, enabled = true) {
  // Ağ, sistem sahibinin işletmeye açtığı bir özelliktir; kapalıysa sorgu hiç gitmez.
  const networkOn = useAuth().hasFeature('network');
  const debounced = useDebounced((phone ?? '').trim(), 650);
  const ready = enabled && networkOn && phoneDigits(debounced) >= 7;
  const query = useQuery({
    queryKey: ['customer-network', 'lookup', debounced],
    queryFn: () => lookupPhone(debounced),
    enabled: ready,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
  });
  return { ...query, phone: debounced, data: ready ? query.data : undefined };
}

const BUCKET_TEXT: Record<DebtBucket, string> = {
  '0-30': '0-30 gün',
  '31-60': '31-60 gün',
  '61-90': '61-90 gün',
  '90+': '90 günden eski',
};

const BUCKET_TONE: Record<DebtBucket, string> = {
  '0-30': 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  '31-60': 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100',
  '61-90': 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  '90+': 'bg-red-200 text-red-950 dark:bg-red-900/60 dark:text-red-50',
};

const ageText = (d: number) => (d === 0 ? 'bugün' : d === 1 ? '1 gündür' : d < 60 ? `${d} gündür` : `${Math.round(d / 30)} aydır`);

/** Başka işletmelerdeki borç uyarıları — TUTAR YOK (sunucu göndermez). */
export function DebtWarnings({ warnings, compact = false }: { warnings: DebtWarning[]; compact?: boolean }) {
  if (!warnings.length) return null;
  const worst = Math.max(...warnings.map((w) => w.ageDays));
  return (
    <div
      role="alert"
      className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-950/30"
    >
      <p className="font-semibold text-red-900 dark:text-red-100">
        ⚠ Bu telefon numarası başka {warnings.length > 1 ? `${warnings.length} işletmede` : 'bir işletmede'} borçlu görünüyor
      </p>
      <ul className="space-y-1">
        {warnings.map((w) => (
          <li key={w.shopName} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">🏭 {w.shopName}</span>
            <span className={`badge ${BUCKET_TONE[w.bucket]}`}>
              {ageText(w.ageDays)} · {BUCKET_TEXT[w.bucket]}
            </span>
            {!compact && w.openItems > 0 && <span className="text-xs text-slate-600 dark:text-slate-300">{w.openItems} ödenmemiş kalem</span>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-red-800 dark:text-red-200">
        Borç tutarı paylaşılmaz; yalnızca hangi işletmeye ne zamandır borç olduğu görünür.
        {worst > 60 && ' Uzun süredir ödenmemiş borç var: veresiye çalışırken dikkatli olun.'}
      </p>
    </div>
  );
}

/** Kayıtlı müşterinin başka işletmelerdeki borç uyarıları (müşteri kartı). */
export function CustomerNetworkWarnings({ customerId, enabled = true }: { customerId: string; enabled?: boolean }) {
  const networkOn = useAuth().hasFeature('network');
  const { data } = useQuery({
    queryKey: ['customer-network', 'customer', customerId],
    queryFn: () => fetchCustomerWarnings(customerId),
    enabled: enabled && networkOn,
    staleTime: 60_000,
    retry: false,
  });
  if (!data) return null;
  return <DebtWarnings warnings={data.debtWarnings} />;
}

/**
 * Form altındaki ağ bildirimi: aynı telefonla kendi kaydınız, başka işletmedeki
 * bilgi önerisi (yükle / geri al) ve borç uyarıları.
 */
export function PhoneNetworkNotice({
  lookup,
  applied,
  onApply,
  onUndo,
  currentCustomerId,
}: {
  lookup: PhoneLookup | undefined;
  /** Öneri forma yüklendi mi? */
  applied: boolean;
  onApply: () => void;
  onUndo: () => void;
  /** Düzenlenen müşteri: kendi kaydı "zaten kayıtlı" sayılmaz. */
  currentCustomerId?: string;
}) {
  if (!lookup || !lookup.phone) return null;
  const own = lookup.own && lookup.own.id !== currentCustomerId ? lookup.own : null;
  const s = lookup.suggestion;
  const debtOff = !lookup.network.debtInfo;
  if (!own && !s && lookup.debtWarnings.length === 0 && !debtOff) return null;

  return (
    <div className="space-y-2" aria-live="polite">
      {own && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          ℹ️ Bu telefonla bu işletmede <b>{own.name}</b> zaten kayıtlı. Aynı kişiyi ikinci kez eklemek yerine mevcut kaydı kullanın.
        </p>
      )}
      {s && (
        <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            🔗 Bu numara {s.sources > 1 ? `${s.sources} başka işletmede` : 'başka bir işletmede'} de kayıtlı:{' '}
            <b>{s.name}</b>
            {s.companyName ? ` — ${s.companyName}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-blue-800 dark:text-blue-200">
            {applied
              ? 'Bilgiler forma yüklendi. İsterseniz alanları değiştirip farklı bilgilerle kaydedebilirsiniz.'
              : 'Ad ve iletişim bilgilerini forma yükleyebilirsiniz; değiştirmekte serbestsiniz.'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {applied ? (
              <button type="button" className="btn-secondary btn-sm" onClick={onUndo}>
                ↩ Yüklenenleri geri al
              </button>
            ) : (
              <button type="button" className="btn-primary btn-sm" onClick={onApply}>
                Bilgileri yükle
              </button>
            )}
          </div>
        </div>
      )}
      <DebtWarnings warnings={lookup.debtWarnings} />
      {debtOff && (
        <p className="text-xs text-slate-500">
          Borç uyarı ağına katılmadığınız için diğer işletmelerdeki borç bilgisi gösterilmiyor.{' '}
          <Link to="/business" className="font-medium text-blue-700 hover:underline">
            İşletme profilinden aç
          </Link>
        </p>
      )}
    </div>
  );
}

import { RunnerPanel } from '../../components/RunnerStatus';
import { useAuth } from '../../context/AuthContext';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBusinessSettings,
  fetchTelegramSettings,
  reloadTelegram,
  testTelegram,
  fetchFolderSettings,
  updateFolderSettings,
  type FolderSettings,
  type TelegramRoute,
  type TelegramTopic,
  updateBusinessSettings,
  fetchDisplaySettings,
  fetchPricingSettings,
  updateDisplaySettings,
  updatePricingSettings,
  updateTelegramSettings,
  fetchCorelIntegration,
  rotateCorelKey,
  disableCorelIntegration,
  fetchCutPricing,
  updateCutPricing,
  fetchMorningSummary,
  updateMorningSummary,
  previewMorningSummary,
  sendMorningSummary,
  type CutPricing,
  type SettingSource,
  type UpdateBusinessInput,
} from '../../api/settings.api';
import {
  cleanupBackups,
  downloadBackup,
  fetchBackups,
  fetchBackupUsage,
  fetchDecryptionKey,
  fetchTelegramBackupState,
  restoreBackup,
  restoreNeedsKey,
  sendBackupToTelegram,
} from '../../api/backups.api';
import {
  clearNotifications,
  fetchNotifications,
  fetchNotificationStats,
} from '../../api/notifications.api';
import {
  dedupeCatalog,
  fetchCatalogDuplicates,
} from '../../api/materials.api';
import { useLock } from '../../context/LockContext';
import { API_URL } from '../../api/client';
import { confirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingBlock, Spinner } from '../../components/ui/Loading';
import { useUrlParam } from '../../hooks/useUrlParam';
import { apiErrorMessage, toast } from '../../lib/toast';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../../lib/format';
import { SECTIONS, type SectionId, type SectionMeta } from './sections';
import {
  createReplica,
  deleteReplica,
  fetchReplicas,
  updateReplica,
  type SyncReplica,
} from '../../api/system.api';
import { useSyncStatus, useSystemInfo } from '../../hooks/useSystemInfo';

/** Etiketli form alanı. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  inputMode?: 'text' | 'tel' | 'url' | 'numeric' | 'decimal';
}) {
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

// Bölüm listesi ayrı dosyada: hızlı arama (Ctrl+K) bu sayfayı yüklemeden kullanır.

const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<SectionId, SectionMeta>;
const SECTION_PREFIX = 'ayar-';
const sectionDomId = (id: SectionId) => `${SECTION_PREFIX}${id}`;

/** Aramada Türkçe harf farkı gözetilmez: "ozet" = "özet", "sifre" = "şifre". */
const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c);

function sectionMatches(s: SectionMeta, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(`${s.title} ${s.short} ${s.description} ${s.keywords}`);
  return words.every((w) => hay.includes(w));
}

/** Aramayla görünür kalan bölümler; gizlenen kart DOM'da kalır (yazılan form kaybolmaz). */
const VisibleSections = createContext<Set<SectionId> | null>(null);

/**
 * Kartın verisi istensin mi? Kart ekrana yaklaşınca (bir kez görününce açık
 * kalır) ve aramayla gizlenmemişken true. Böylece sayfa açılınca bütün
 * kartların sorguları (katalog kopya taraması, yedekler, bildirimler …)
 * aynı anda gitmez; aşağı kaydırdıkça ya da bölüme gidildikçe yüklenir.
 */
function useSectionActive(id: SectionId): boolean {
  const visible = useContext(VisibleSections);
  const hiddenBySearch = visible ? !visible.has(id) : false;
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen || hiddenBySearch) return;
    const el = document.getElementById(sectionDomId(id));
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      // Ekrana girmeden biraz önce yüklensin (kaydırırken boş görünmesin).
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id, seen, hiddenBySearch]);
  return seen && !hiddenBySearch;
}

/** Bütün ayar kartlarının ortak çerçevesi: simge + başlık + tek satır açıklama. */
function SettingsSection({
  id,
  badge,
  children,
}: {
  id: SectionId;
  /** Başlığın yanında küçük durum rozeti (Açık/Kapalı …). */
  badge?: ReactNode;
  children: ReactNode;
}) {
  const meta = SECTION_BY_ID[id];
  const visible = useContext(VisibleSections);
  const domId = sectionDomId(id);
  return (
    <section
      id={domId}
      tabIndex={-1}
      aria-labelledby={`${domId}-baslik`}
      hidden={visible ? !visible.has(id) : false}
      className="card scroll-mt-20 space-y-3 focus:outline-none lg:scroll-mt-28"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl leading-none"
          aria-hidden
        >
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={`${domId}-baslik`} className="text-base font-semibold sm:text-lg">
              {meta.title}
            </h2>
            {badge}
          </div>
          <p className="text-sm text-slate-500">{meta.description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Başlık yanındaki Açık/Kapalı rozeti. */
function OnOffBadge({ on, onText = 'Açık', offText = 'Kapalı' }: { on: boolean; onText?: string; offText?: string }) {
  return (
    <span className={`badge ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
      {on ? onText : offText}
    </span>
  );
}

/**
 * Yapışkan bölüm şeridi: sayfa kaydırılırken üstte kalır, dokunulan bölüme
 * kayar; ekranda olan bölümün çipi vurgulanır. Telefonda şerit yana kayar.
 */
function SectionNav({ sections, readOnly }: { sections: SectionMeta[]; readOnly: boolean }) {
  const [active, setActive] = useState<SectionId | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // Çipe tıklanınca yumuşak kaydırma bitene kadar gözlemci vurguyu değiştirmesin.
  const lockRef = useRef(0);
  const key = sections.map((s) => s.id).join(',');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = key
      .split(',')
      .filter(Boolean)
      .map((id) => document.getElementById(sectionDomId(id as SectionId)))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) seen.set(en.target, en.isIntersecting);
        if (Date.now() < lockRef.current) return;
        const first = els.find((el) => seen.get(el));
        if (first) setActive(first.id.slice(SECTION_PREFIX.length) as SectionId);
      },
      // Şeridin hemen altından ekranın üst yarısına kadarki bant "şu an okunan" bölümdür.
      { root: navRef.current?.closest('main') ?? null, rootMargin: '-100px 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);

  // Vurgulanan çip telefonda şeridin görünen kısmına kaysın.
  useEffect(() => {
    const row = rowRef.current;
    const chip = active ? row?.querySelector<HTMLElement>(`[data-section="${active}"]`) : null;
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo?.({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  const go = (e: ReactMouseEvent<HTMLAnchorElement>, id: SectionId) => {
    // Ctrl/⌘ ile yeni sekmede açmak serbest.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const el = document.getElementById(sectionDomId(id));
    if (!el) return;
    lockRef.current = Date.now() + 1000;
    setActive(id);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
    try {
      window.history.replaceState(window.history.state, '', `#${sectionDomId(id)}`);
    } catch {
      /* adres güncellenemezse kaydırma yine de çalışır */
    }
  };

  if (!sections.length && !readOnly) return null;

  return (
    <nav
      ref={navRef}
      aria-label="Ayar bölümleri"
      className="no-print sticky top-0 z-20 -mx-3 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 dark:bg-slate-900/95"
    >
      <div ref={rowRef} className="relative flex gap-1.5 overflow-x-auto lg:flex-wrap lg:overflow-visible">
        {readOnly && (
          <span
            className="badge min-h-[36px] shrink-0 bg-amber-100 px-3 text-amber-800"
            title="Bu dükkânın ayarlarında yazma izniniz yok."
          >
            🔒 Salt okunur
          </span>
        )}
        {sections.map((s) => {
          const on = active === s.id;
          return (
            <a
              key={s.id}
              href={`#${sectionDomId(s.id)}`}
              data-section={s.id}
              aria-current={on ? 'location' : undefined}
              onClick={(e) => go(e, s.id)}
              className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition ${
                on
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100'
              }`}
            >
              <span aria-hidden>{s.icon}</span>
              {s.short}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Ayarlar (İşletme Sahibi). İşletme/proje kimliği tek ekrandan düzenlenir;
 * PDF/yazdırma belgelerinde ve arayüz başlığında bu ad/bilgiler kullanılır.
 *
 * Bağlantılar: /settings#ayar-telegram doğrudan bölüme gider,
 * /settings?q=yedek arama kutusunu doldurur.
 */
export function SettingsPage() {
  const qc = useQueryClient();
  const { isOwner, shop, can } = useAuth();
  const canWrite = can('settings', 'write');
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'business'],
    queryFn: fetchBusinessSettings,
  });

  const [form, setForm] = useState<UpdateBusinessInput>({});
  useEffect(() => {
    if (data) {
      setForm({
        businessName: data.name,
        businessAddress: data.address,
        businessPhone: data.phone,
        businessTaxNo: data.taxNo,
        businessLogoPath: data.logoPath,
        portalBaseUrl: data.portalBaseUrl,
      });
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () => updateBusinessSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'business'] });
      if (form.businessName) document.title = `${form.businessName} ERP`;
    },
  });

  const set = (patch: Partial<UpdateBusinessInput>) =>
    setForm((f) => ({ ...f, ...patch }));

  // Bölüm araması; ?q=… ile gelindiyse kutu dolu açılır.
  const [query, setQuery] = useState('');
  useUrlParam('q', setQuery);
  // Yedek ve bakım yalnız sistem sahibine (aşağıdaki koşulla aynı).
  const shown = useMemo(
    () => SECTIONS.filter((s) => (!s.ownerOnly || isOwner) && sectionMatches(s, query)),
    [isOwner, query],
  );
  const shownIds = useMemo(() => new Set(shown.map((s) => s.id)), [shown]);

  // Adresteki #ayar-… bölümüne git (sayfa yüklendikten sonra).
  useEffect(() => {
    if (isLoading) return;
    const target = decodeURIComponent(window.location.hash.slice(1));
    if (!target.startsWith(SECTION_PREFIX)) return;
    const t = window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }), 150);
    return () => window.clearTimeout(t);
  }, [isLoading]);

  if (isLoading) return <LoadingBlock rows={4} />;

  return (
    <div className="space-y-4">
      <PageHeader
        icon="⚙️"
        title={`Dükkân ayarları${shop ? ` — ${shop.name}` : ''}`}
        subtitle="Buradaki ad ve bilgiler bu dükkânın PDF/yazdırma belgelerinde (teklif, fatura, fiş, ekstre, raporlar) ve uygulama başlığında kullanılır. Her dükkânın ayarları ayrıdır."
        actions={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Ayar ara… (telegram, yedek, PIN)"
            aria-label="Ayar ara"
            className="w-full sm:w-72"
          />
        }
      />
      {!canWrite && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span className="text-xl leading-none" aria-hidden>
            🔒
          </span>
          <div className="min-w-0">
            <div className="font-semibold">Salt okunur</div>
            <p>Bu dükkânın ayarlarını görebilirsiniz ama değiştiremezsiniz (yazma izni yok).</p>
          </div>
        </div>
      )}

      <SectionNav sections={shown} readOnly={!canWrite} />

      {shown.length === 0 && (
        <EmptyState
          icon="🔎"
          title="Eşleşen ayar yok"
          hint={`“${query}” için bir bölüm bulunamadı. Başka bir sözcük deneyin: telegram, yedek, PIN, fiyat, Corel…`}
          action={
            <button className="btn-secondary btn-sm" onClick={() => setQuery('')}>
              Aramayı temizle
            </button>
          }
        />
      )}

      <VisibleSections.Provider value={shownIds}>
        <SettingsSection id="isletme">
          <Field
            label="İşletme / Proje adı"
            value={form.businessName ?? ''}
            placeholder="Örn. Acme Reklam & İmalat"
            onChange={(v) => set({ businessName: v })}
            hint="Belgelerin başlığında ve site başlığında görünür."
          />
          <Field
            label="Adres"
            value={form.businessAddress ?? ''}
            onChange={(v) => set({ businessAddress: v })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Telefon"
              value={form.businessPhone ?? ''}
              inputMode="tel"
              onChange={(v) => set({ businessPhone: v })}
            />
            <Field
              label="Vergi No (VKN)"
              value={form.businessTaxNo ?? ''}
              inputMode="numeric"
              onChange={(v) => set({ businessTaxNo: v })}
            />
          </div>
          <Field
            label="Logo dosya yolu (opsiyonel)"
            value={form.businessLogoPath ?? ''}
            onChange={(v) => set({ businessLogoPath: v })}
            hint="Sunucuda erişilebilir bir dosya yolu (ileride belge başlığına basmak için)."
          />
          <Field
            label="Müşteri portalı temel adresi"
            value={form.portalBaseUrl ?? ''}
            inputMode="url"
            onChange={(v) => set({ portalBaseUrl: v })}
            hint="Örn. http://192.168.1.50:5173/portal"
          />

          {mut.isError && (
            <p className="text-sm text-red-600">
              {(mut.error as { response?: { data?: { message?: string } } })
                ?.response?.data?.message ?? 'Kaydedilemedi.'}
            </p>
          )}

          <button
            className="btn-primary"
            disabled={mut.isPending || !canWrite}
            title={canWrite ? undefined : 'Yazma izniniz yok'}
            onClick={() => mut.mutate()}
          >
            {mut.isPending && <Spinner />}
            Kaydet
          </button>
        </SettingsSection>

        <DisplaySettingsCard />
        <PricingSettingsCard />
        <CutPricingCard />
        <CorelIntegrationCard />
        {isOwner && <ReplicaSection />}
        <CatalogHealthCard />
        <ScreenLockSettings />
        <TelegramSettings />
        <MorningSummaryCard />
        {/* Yedek bütün veritabanını kapsar: yalnız sistem sahibi. */}
        {isOwner && <BackupSection />}
        {isOwner && <MaintenanceSection />}
        <NotificationsHistory />
      </VisibleSections.Provider>
    </div>
  );
}

/** Kart içindeki alt kutu (başlıklı, ince çerçeveli). */
function SubBox({
  title,
  children,
  className = 'border-slate-200',
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${className}`}>
      {title && <div className="text-sm font-semibold">{title}</div>}
      {children}
    </div>
  );
}

/**
 * 👁️ Görünüm: ekranda hangi hassas düğmelerin çıkacağı.
 *
 * Cari ekstresindeki "Geri al" düğmeleri varsayılan olarak GİZLİDİR — ekran
 * müşteriye gösterildiğinde "borcum siliniyor" gibi yanlış anlaşılmasın diye.
 */
function DisplaySettingsCard() {
  const qc = useQueryClient();
  const active = useSectionActive('gorunum');
  const { data } = useQuery({
    queryKey: ['settings', 'display'],
    queryFn: fetchDisplaySettings,
    enabled: active,
  });

  const mut = useMutation({
    mutationFn: (showLedgerUndo: boolean) =>
      updateDisplaySettings({ showLedgerUndo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'display'] }),
  });

  const on = data?.showLedgerUndo === true;

  return (
    <SettingsSection id="gorunum">
      <SubBox>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 shrink-0"
            checked={on}
            disabled={!data || mut.isPending}
            onChange={(e) => mut.mutate(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              Cari ekstresinde "Geri al" düğmelerini göster
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              Kapalıyken ekstre tablosunda işlem sütunu hiç çizilmez — ekranı
              müşteriye gösterdiğinizde ödeme/borç silme düğmesi görünmez ve
              yanlış anlaşılmaz. Yanlış bir kaydı geri almanız gerektiğinde bu
              seçeneği açın, işi bitince kapatın.
            </span>
            <span className="mt-1 block text-xs text-slate-400">
              Not: bu yalnızca GÖRÜNÜMü etkiler. Kimin neyi geri alabileceği
              değişmez — manuel hareketi yalnızca İşletme Sahibi, ödemeleri
              çalışan da son 3 gün içinde geri alabilir.
            </span>
          </span>
        </label>

        <p
          className={`rounded-lg px-2 py-1 text-xs font-medium ${
            on
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
          }`}
        >
          {on
            ? '⚠️ Şu an AÇIK — ekstrede geri alma düğmeleri görünüyor.'
            : '✅ Şu an kapalı — müşteriye gösterilebilir.'}
        </p>
        {mut.isError && (
          <p className="text-xs text-red-600">Ayar kaydedilemedi.</p>
        )}
      </SubBox>
    </SettingsSection>
  );
}

/**
 * 💰 Satış fiyatlandırması: malzeme satışında perakende fiyatın üzerine
 * eklenen kâr yüzdesi ve konsinye (başkasının malzemesi) komisyon oranı.
 */
function PricingSettingsCard() {
  const qc = useQueryClient();
  const active = useSectionActive('satis-fiyat');
  const { data } = useQuery({
    queryKey: ['settings', 'pricing'],
    queryFn: fetchPricingSettings,
    enabled: active,
  });
  const [markup, setMarkup] = useState('');
  const [commission, setCommission] = useState('');
  useEffect(() => {
    if (data) {
      setMarkup(String(data.saleMarkupPercent));
      setCommission(String(data.consignmentCommissionPercent));
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      updatePricingSettings({
        saleMarkupPercent: Number(markup) || 0,
        consignmentCommissionPercent: Number(commission) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'pricing'] });
      qc.invalidateQueries({ queryKey: ['plate-pricing'] });
    },
  });

  const example = 100 * (1 + (Number(markup) || 0) / 100);

  return (
    <SettingsSection id="satis-fiyat">
      <p className="text-sm text-slate-500">
        Malzeme satışında birim fiyat, malzemenin <b>perakende fiyatı</b>{' '}
        üzerine buradaki kâr yüzdesi eklenerek otomatik önerilir. Bir malzemeye
        özel oran girilmişse o önceliklidir (Stok › malzeme düzenleme).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="label">Genel kâr yüzdesi (%)</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
          />
          <span className="mt-1 block text-xs text-slate-400">
            Örnek: perakende {formatMoney(100)} → satış <b className="text-slate-600">{formatMoney(example)}</b>
          </span>
        </label>
        <label className="block min-w-0">
          <span className="label">Konsinye komisyon oranı (%)</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
          />
          <span className="mt-1 block text-xs text-slate-400">
            Başkasının malzemesi satılırken işletmede kalan pay. Teklif
            kalemlerinde başlangıç değeri olarak gelir.
          </span>
        </label>
      </div>
      {mut.isError && <p className="text-sm text-red-600">Kaydedilemedi.</p>}
      <button
        className="btn-primary"
        disabled={mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending && <Spinner />}
        Kaydet
      </button>
    </SettingsSection>
  );
}

/** Sayı alanı: boş bırakılırsa 0. */
function NumField({
  label,
  value,
  onChange,
  hint,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  step?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <input
        className="input"
        type="number"
        inputMode="decimal"
        min={0}
        step={step ?? 'any'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

type CutForm = Record<Exclude<keyof CutPricing, 'currency'>, string>;

/**
 * ⏱️ Kesim fiyatlandırması: teklifte süreyle ve m² ile fiyatın ücretleri ve
 * asgarileri. Corel eklentisinin süre ve m² fiyat modülleri de buradan okur;
 * makine hızları yalnız Corel'in süre hesabında kullanılır.
 */
function CutPricingCard() {
  const qc = useQueryClient();
  const active = useSectionActive('kesim-fiyat');
  const { data } = useQuery({
    queryKey: ['settings', 'cut-pricing'],
    queryFn: fetchCutPricing,
    enabled: active,
  });
  const [f, setF] = useState<CutForm | null>(null);
  useEffect(() => {
    if (data) {
      setF({
        hourlyRate: String(data.hourlyRate),
        minMinutes: String(data.minMinutes),
        areaRate: String(data.areaRate),
        minArea: String(data.minArea),
        feedMmS: String(data.feedMmS),
        rapidMmS: String(data.rapidMmS),
        plungeSec: String(data.plungeSec),
        passDepthMm: String(data.passDepthMm),
      });
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      updateCutPricing(
        Object.fromEntries(
          Object.entries(f ?? {}).map(([k, v]) => [k, Number(v) || 0]),
        ) as Partial<CutPricing>,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'cut-pricing'] }),
  });

  // Veri gelene kadar bölüm yerini korur (hızlı geçiş şeridi onu bulabilsin).
  if (!f) {
    return (
      <SettingsSection id="kesim-fiyat">
        <div className="space-y-2" role="status" aria-label="Yükleniyor">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-20" />
        </div>
      </SettingsSection>
    );
  }
  const set = (k: keyof CutForm) => (v: string) => setF({ ...f, [k]: v });
  const cur = data?.currency ?? 'TRY';
  const rate = Number(f.hourlyRate) || 0;
  const minMin = Number(f.minMinutes) || 0;
  const example = (Math.max(12, minMin) / 60) * rate;

  return (
    <SettingsSection id="kesim-fiyat">
      <p className="text-sm text-slate-500">
        Teklifte işleme kalemi <b>süreyle</b> ya da <b>m² ile</b> fiyatlanabilir.
        Süre seçilince birim fiyat olarak saatlik ücret, m² seçilince m² ücreti
        gelir. Corel eklentisinin süre ve m² fiyat modülleri de bu değerleri
        kullanır.
      </p>

      <SubBox title="Süreyle">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label={`Saatlik ücret (${cur})`} value={f.hourlyRate} onChange={set('hourlyRate')} />
          <NumField
            label="İş en az kaç dakikadan başlar"
            value={f.minMinutes}
            onChange={set('minMinutes')}
            hint="Daha kısa iş bu süreden faturalanır (teklifte de uygulanır)."
          />
        </div>
        <p className="text-xs text-slate-400">
          Örnek: 12 dk'lık iş → {formatNumber(Math.max(12, minMin))} dk × {formatMoney(rate, cur)}/saat ={' '}
          <b className="text-slate-600">{formatMoney(example, cur)}</b>
        </p>
      </SubBox>

      <SubBox title="m² ile">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label={`m² ücreti (${cur})`} value={f.areaRate} onChange={set('areaRate')} />
          <NumField
            label="İş en az kaç m²'den başlar"
            value={f.minArea}
            onChange={set('minArea')}
            hint="Corel'in m² fiyat modülü bu alandan aşağı hesaplamaz."
          />
        </div>
      </SubBox>

      <SubBox title="Makine (Corel süre hesabı)">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="Kesim hızı (mm/sn)" value={f.feedMmS} onChange={set('feedMmS')} />
          <NumField label="Boşta gezme hızı (mm/sn)" value={f.rapidMmS} onChange={set('rapidMmS')} />
          <NumField
            label="Dalma/kalkma (sn, kontur başına)"
            value={f.plungeSec}
            onChange={set('plungeSec')}
          />
          <NumField
            label="Paso derinliği (mm)"
            value={f.passDepthMm}
            onChange={set('passDepthMm')}
            hint="0 = tek paso. Değilse kalınlık / derinlik kadar paso sayılır."
          />
        </div>
        <p className="text-xs text-slate-400">
          Süre = kesim boyu × paso ÷ kesim hızı + konturlar arası gezme ÷ boşta
          hızı + kontur × paso × dalma süresi. Corel'de iş başına değiştirilebilir.
        </p>
      </SubBox>

      {mut.isError && <p className="text-sm text-red-600">Kaydedilemedi.</p>}
      <button className="btn-primary" disabled={mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending && <Spinner />}
        Kaydet
      </button>
    </SettingsSection>
  );
}

/**
 * ☀️ Sabah özeti: her sabah Telegram'a bekleyen işler, gereken plakalar ve
 * stok durumu, azalan stok, işe dönüşmemiş onaylı teklifler.
 */
function MorningSummaryCard() {
  const qc = useQueryClient();
  const active = useSectionActive('sabah-ozeti');
  const { data } = useQuery({
    queryKey: ['settings', 'morning-summary'],
    queryFn: fetchMorningSummary,
    enabled: active,
  });
  const [preview, setPreview] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => updateMorningSummary(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'morning-summary'] }),
  });
  const show = useMutation({ mutationFn: previewMorningSummary, onSuccess: setPreview });
  const send = useMutation({ mutationFn: sendMorningSummary, onSuccess: setPreview });

  const on = data?.enabled === true;
  // "0 8 * * *" → "08:00"; başka biçimlerde ifadenin kendisi gösterilir.
  const m = data?.cron.match(/^(\d+) (\d+) \* \* \*$/);
  const when = m ? `${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}` : data?.cron;

  return (
    <SettingsSection id="sabah-ozeti" badge={data && <OnOffBadge on={on} />}>
      <p className="text-sm text-slate-500">
        Her sabah {when ?? '08:00'}'de Telegram'a: bekleyen işler (makineye göre),
        gereken plakalar ve stokta olup olmadığı, sipariş seviyesinin altına
        düşen malzemeler, onaylanıp işe dönüşmemiş teklifler.
      </p>
      <label
        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
          on ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-slate-200'
        }`}
      >
        <input
          type="checkbox"
          checked={on}
          disabled={!data || toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
        />
        <span className="text-sm font-medium">Her sabah gönder</span>
        {toggle.isPending && <Spinner className="ml-auto text-slate-400" />}
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" disabled={show.isPending} onClick={() => show.mutate()}>
          {show.isPending && <Spinner className="h-3.5 w-3.5" />}
          👁 Bugünkü özeti göster
        </button>
        <button className="btn-secondary btn-sm" disabled={send.isPending} onClick={() => send.mutate()}>
          {send.isPending && <Spinner className="h-3.5 w-3.5" />}
          ✉️ Şimdi Telegram'a gönder
        </button>
      </div>
      {send.isSuccess && (
        <p className="text-xs text-emerald-600">
          Gönderildi (Telegram ayarlıysa). Gönderim geçmişi aşağıda.
        </p>
      )}
      {(show.isError || send.isError) && (
        <p className="text-xs text-red-600">Özet alınamadı.</p>
      )}
      {preview && (
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {preview}
        </pre>
      )}
      <p className="text-xs text-slate-400">
        Saat sunucuda <code>MORNING_SUMMARY_CRON</code> ile değişir (varsayılan
        her gün 08:00, Türkiye saati).
      </p>
    </SettingsSection>
  );
}

/**
 * 🖥️ Yerel sunucular: dükkândaki bilgisayarda çalışan, merkezin kopyasını
 * tutan sunucu. İnternet ya da merkez giderse arayüz ve Corel ona bağlanıp
 * çalışmaya devam eder; eşitleme programı bağlantı gelince işlemleri merkeze
 * gönderir (docs/SYNC.md). Burada her yerel sunucu için anahtar üretilir.
 */
function ReplicaSection() {
  const qc = useQueryClient();
  const active = useSectionActive('yerel-sunucu');
  const { shops } = useAuth();
  const { data: info } = useSystemInfo();
  const replicaMode = info?.role === 'replica';
  const { data: status } = useSyncStatus(active && replicaMode);
  const { data: list, isLoading } = useQuery({
    queryKey: ['sync', 'replicas'],
    queryFn: fetchReplicas,
    enabled: active && info?.role === 'primary',
  });
  const [name, setName] = useState('');
  const [scope, setScope] = useState<string[]>([]);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const done = () => qc.invalidateQueries({ queryKey: ['sync', 'replicas'] });
  const create = useMutation({
    mutationFn: () => createReplica({ name: name.trim(), shopIds: scope.length ? scope : undefined }),
    onSuccess: (r) => {
      setCreated({ name: r.replica.name, token: r.token });
      setName('');
      setScope([]);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Oluşturulamadı.')),
    onSettled: done,
  });
  const toggle = useMutation({
    mutationFn: (r: SyncReplica) => updateReplica(r.id, { isActive: !r.isActive }),
    onSettled: done,
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteReplica(id), onSettled: done });
  const upstream = new URL(API_URL, window.location.origin).href.replace(/\/$/, '');
  const shopName = (id: string) => shops.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  if (replicaMode) {
    return (
      <SettingsSection id="yerel-sunucu" badge={<OnOffBadge on onText="Bu sunucu yerel" />}>
        <p className="text-sm text-slate-500">
          Bu arayüz dükkândaki yerel sunucuya bağlı. Yerel sunucu anahtarları merkez sunucudaki
          Ayarlar ekranından yönetilir.
        </p>
        <SubBox>
          <p className="text-sm">
            Merkez: <span className="font-mono text-xs">{status?.upstreamUrl ?? '—'}</span>
          </p>
          <p className="text-sm">
            Son bağlantı: {status?.lastContactAt ? formatDateTime(status.lastContactAt) : '—'}
          </p>
        </SubBox>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection id="yerel-sunucu" badge={list && <OnOffBadge on={list.some((r) => r.isActive)} onText={`${list.filter((r) => r.isActive).length} etkin`} offText="Yok" />}>
      <p className="text-sm text-slate-500">
        Yerel sunucu, dükkândaki bir bilgisayarda çalışan StockTrack kopyasıdır (aynı program,
        <code className="mx-1">SYNC_ROLE=replica</code>). Arayüz ve Corel eklentisi ona bağlanır;
        internet ya da merkez sunucu giderse çalışma durmaz. Yanındaki eşitleme programı bağlantı
        gelince yerelde yapılan işlemleri buraya gönderir, buradaki değişiklikleri yerele indirir.
        Merkezde reddedilen işlem (ör. stok o arada başka yerde satılmış) yerel sunucunun
        Eşitleme ekranında karar için bekler.
      </p>

      {created && (
        <SubBox title={`"${created.name}" için anahtar — yalnız şimdi görünür`}>
          <div className="flex gap-2">
            <input className="input min-w-0 font-mono text-xs md:text-xs" readOnly value={created.token} aria-label="Yerel sunucu anahtarı" data-replica-token />
            <button
              className="btn-secondary btn-sm shrink-0"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(created.token);
                  toast.success('Kopyalandı');
                } catch {
                  toast.error('Kopyalanamadı', 'Metni seçip elle kopyalayın.');
                }
              }}
            >
              Kopyala
            </button>
          </div>
          <p className="text-xs text-slate-500">Eşitleme programının ayarına yazın:</p>
          <pre className="overflow-auto rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-900">{`UPSTREAM_URL=${upstream}\nREPLICA_TOKEN=${created.token}`}</pre>
          <button className="btn-secondary btn-sm" onClick={() => setCreated(null)}>
            Kaydettim, kapat
          </button>
        </SubBox>
      )}

      <SubBox title="Yeni yerel sunucu">
        <label className="block">
          <span className="label">Ad</span>
          <input className="input" placeholder="Örn. Merkez dükkân PC" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div>
          <span className="label">Dükkânlar (seçilmezse hepsi)</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {shops.filter((s) => s.isActive).map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={scope.includes(s.id)}
                  onChange={(e) => setScope((v) => (e.target.checked ? [...v, s.id] : v.filter((x) => x !== s.id)))}
                />
                {s.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Yalnız seçilen dükkânların verisi yerel sunucuya iner. Dükkânlar arası satış yerel sunucuda yapılmaz.
          </p>
        </div>
        <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          Anahtar üret
        </button>
      </SubBox>

      {isLoading && <LoadingBlock rows={1} />}
      {list?.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700" data-replica={r.name}>
          <div className="min-w-0">
            <p className="font-semibold">
              {r.name} <span className="font-mono text-xs text-slate-400">{r.tokenPrefix}…</span>
            </p>
            <p className="text-xs text-slate-500">
              {r.shopIds.length ? r.shopIds.map(shopName).join(', ') : 'Bütün dükkânlar'} · son görülme{' '}
              {r.lastSeenAt ? formatDateTime(r.lastSeenAt) : 'hiç'}
              {r.lag != null ? ` · ${r.lag} değişiklik geride` : ''} · gönderilen {r.pushedOps}
              {r.rejectedOps ? ` · reddedilen ${r.rejectedOps}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" disabled={toggle.isPending} onClick={() => toggle.mutate(r)}>
              {r.isActive ? 'Durdur' : 'Etkinleştir'}
            </button>
            <button
              className="btn-danger-soft btn-sm"
              onClick={async () => {
                if (
                  await confirmDialog({
                    message: `"${r.name}" silinsin mi? Anahtarı çalışmaz; yerel sunucu merkezle eşitlenemez.`,
                    confirmText: 'Sil',
                    danger: true,
                  })
                )
                  remove.mutate(r.id);
              }}
            >
              Sil
            </button>
          </div>
        </div>
      ))}
      {list && !list.length && <p className="text-sm text-slate-500">Henüz yerel sunucu yok.</p>}
    </SettingsSection>
  );
}

/**
 * 🖌️ Corel entegrasyonu: CorelDRAW eklentisi (ac2f pack) müşteriyi ve
 * stoktaki malzemeyi buradan okur, dışa aktarılan dosyaya ve takım yolu
 * klasörlerine adı bu bilgilerle verir. Eklenti yalnızca okur.
 */
function CorelIntegrationCard() {
  const qc = useQueryClient();
  const active = useSectionActive('corel');
  const { data } = useQuery({
    queryKey: ['settings', 'corel'],
    queryFn: fetchCorelIntegration,
    enabled: active,
  });
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState<'key' | 'url' | null>(null);

  const onDone = () => qc.invalidateQueries({ queryKey: ['settings', 'corel'] });
  const rotate = useMutation({ mutationFn: rotateCorelKey, onSuccess: onDone });
  const disable = useMutation({
    mutationFn: disableCorelIntegration,
    onSuccess: onDone,
  });

  // Eklentiye yazılacak adres: arayüzün açıldığı sunucu + API öneki.
  const serverUrl = new URL(API_URL, window.location.origin).href.replace(/\/$/, '');
  const onLocalhost = /\/\/(localhost|127\.0\.0\.1)[:/]/.test(serverUrl);

  const copy = async (what: 'key' | 'url', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
      toast.error('Kopyalanamadı', 'Metni seçip elle kopyalayın.');
    }
  };

  const enabled = data?.enabled === true;
  const busy = rotate.isPending || disable.isPending;

  const onRotate = async () => {
    if (
      enabled &&
      !(await confirmDialog({
        title: 'Yeni anahtar üretilsin mi?',
        message:
          'Yeni anahtar üretilince eski anahtar çalışmaz; eklentiye yenisini yapıştırmanız gerekir. Devam edilsin mi?',
        confirmText: 'Yeni anahtar üret',
        danger: true,
      }))
    )
      return;
    rotate.mutate();
  };

  const onDisable = async () => {
    if (
      await confirmDialog({
        message: 'Corel entegrasyonu kapatılsın mı?',
        confirmText: 'Kapat',
        danger: true,
      })
    ) {
      disable.mutate();
    }
  };

  return (
    <SettingsSection id="corel" badge={data && <OnOffBadge on={enabled} />}>
      <p className="text-sm text-slate-500">
        CorelDRAW eklentisi (ac2f pack) dosyayı bir müşteriye bağlarken müşteri
        listesini, malzeme seçerken stoğu buradan okur. Dışa aktarılan DXF ve
        takım yolu klasörleri bu bilgilerle otomatik adlandırılır. Eklenti
        hiçbir kayıt yazmaz.
      </p>

      <SubBox>
        <p
          className={`text-xs font-medium ${
            enabled ? 'text-emerald-700' : 'text-slate-500'
          }`}
        >
          {enabled
            ? '✅ Açık — eklenti aşağıdaki anahtarla bağlanabilir.'
            : 'Kapalı — eklentinin bağlanması için anahtar oluşturun.'}
        </p>

        <div>
          <span className="label">Sunucu adresi</span>
          <div className="flex gap-2">
            <input
              className="input min-w-0 font-mono text-xs md:text-xs"
              readOnly
              aria-label="Sunucu adresi"
              value={serverUrl}
              onFocus={(e) => e.target.select()}
            />
            <button className="btn-secondary shrink-0" onClick={() => copy('url', serverUrl)}>
              {copied === 'url' ? '✓ Kopyalandı' : 'Kopyala'}
            </button>
          </div>
          {onLocalhost && (
            <span className="mt-1 block text-xs text-amber-700">
              Corel başka bir bilgisayardaysa <code>localhost</code> yerine bu
              sunucunun yerel ağ adresini yazın (ör. 192.168.1.50).
            </span>
          )}
        </div>

        {enabled && data && (
          <div>
            <span className="label">Anahtar</span>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <input
                className="input min-w-0 flex-1 basis-full font-mono text-xs sm:basis-auto md:text-xs"
                readOnly
                aria-label="Anahtar"
                type={show ? 'text' : 'password'}
                value={data.apiKey}
                onFocus={(e) => e.target.select()}
              />
              <button className="btn-secondary shrink-0" onClick={() => setShow((v) => !v)}>
                {show ? 'Gizle' : 'Göster'}
              </button>
              <button className="btn-secondary shrink-0" onClick={() => copy('key', data.apiKey)}>
                {copied === 'key' ? '✓ Kopyalandı' : 'Kopyala'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={!data || busy}
            onClick={() => void onRotate()}
          >
            {rotate.isPending && <Spinner />}
            {enabled ? 'Yeni anahtar üret' : 'Anahtar oluştur'}
          </button>
          {enabled && (
            <button
              className="btn-danger-soft"
              disabled={busy}
              onClick={() => void onDisable()}
            >
              Kapat
            </button>
          )}
        </div>
        {(rotate.isError || disable.isError) && (
          <p className="text-xs text-red-600">İşlem yapılamadı.</p>
        )}

        <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <p className="font-medium">Corel tarafında:</p>
          <p>
            ac2fPack menüsü › <b>Job setup</b> › sunucu adresini ve anahtarı
            yapıştırın. Ardından <b>Link customer</b> ile dosyayı müşteriye
            bağlayın.
          </p>
        </div>
      </SubBox>

      {/* Dükkân bilgisayarındaki runner: teklif işe dönünce klasörleri açar. */}
      <SubBox title="Otomatik klasörler (dükkân bilgisayarı)">
        <p className="text-xs text-slate-500">
          Teklif <b>işe dönüştürülünce</b> müşteri ve takım yolu klasörlerini dükkân
          bilgisayarındaki StockTrack Runner açar (teklif oluşturulunca değil). Runner aynı
          anahtarla bağlanır ve her 30 sn'de bir durumunu bildirir.
        </p>
        <RunnerPanel canManage={enabled} active={active} />
      </SubBox>

      <FolderCreatorPanel active={active} />
    </SettingsSection>
  );
}

/**
 * Bu dükkânın klasör oluşturucusu: runner bu dükkânın anahtarıyla bağlanınca
 * okur. Her dükkânın ayrı ayarı vardır (aç/kapat, klasör belirtecindeki kod,
 * malzeme satışına klasör, gün klasörü kökü).
 */
function FolderCreatorPanel({ active }: { active: boolean }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canWrite = can('settings', 'write');
  const { data } = useQuery({ queryKey: ['settings', 'folders'], queryFn: fetchFolderSettings, enabled: active });
  const [form, setForm] = useState<{ enabled: boolean; code: string; materialSaleFolders: boolean; dayRoot: string } | null>(null);
  useEffect(() => {
    if (data) {
      setForm({
        enabled: data.enabled,
        code: data.customCode,
        materialSaleFolders: data.materialSaleFolders,
        dayRoot: data.dayRoot,
      });
    }
  }, [data]);
  const save = useMutation({
    mutationFn: () => updateFolderSettings(form!),
    onSuccess: (next: FolderSettings) => {
      qc.setQueryData(['settings', 'folders'], next);
      toast.success('Klasör ayarları kaydedildi', `Belirteç kodu: ${next.code}`);
    },
    onError: (e) => toast.error('Kaydedilemedi', apiErrorMessage(e)),
  });
  if (!data || !form) return null;

  // Önizleme: yazılan kodun klasör adına girecek hâli (sunucu da böyle kısaltır).
  const code =
    form.code
      .toLocaleLowerCase('tr')
      .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c)
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20)
      .replace(/-+$/, '') || data.code;
  const today = new Date();
  const dd = (n: number) => String(n).padStart(2, '0');
  const stamp = `F${dd(today.getDate())}-${dd(today.getMonth() + 1)}-${today.getFullYear()}`;

  return (
    <SubBox title={`📁 Bu dükkânın klasör oluşturucusu — ${data.shopName}`}>
      <p className="text-xs text-slate-500">
        Her dükkânın ayarı ayrıdır; runner hangi dükkânın anahtarıyla bağlanırsa o dükkânın ayarını kullanır.
        Bir bilgisayar birden çok dükkâna klasör açıyorsa her dükkâna ayrı gün klasörü kökü verin.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.enabled}
          disabled={!canWrite}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        Bu dükkânın teklifleri işe dönünce klasör aç
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.materialSaleFolders}
          disabled={!canWrite || !form.enabled}
          onChange={(e) => setForm({ ...form, materialSaleFolders: e.target.checked })}
        />
        Kesimsiz malzeme satışına da klasör aç (<code>malzeme-F…</code>)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Klasör belirtecindeki işletme kodu"
          value={form.code}
          disabled={!canWrite}
          onChange={(v) => setForm({ ...form, code: v })}
          placeholder={data.code}
          hint="İşletmenin malından kesilen tabakada sahip olarak yazılır. Boşsa dükkân adından."
        />
        <Field
          label="Gün klasörü kökü (dükkân bilgisayarında)"
          value={form.dayRoot}
          disabled={!canWrite}
          onChange={(v) => setForm({ ...form, dayRoot: v })}
          placeholder="Boş: runner / Corel eklentisi / CDR Auto Renamer ayarı"
          hint="Örn. D:\Isler\Merkez — runner'ın kendi ayarı doluysa o geçer."
        />
      </div>
      <div className="rounded-lg bg-slate-50 p-2 font-mono text-[11px] leading-5 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        <div className="font-sans text-xs font-medium text-slate-500">Klasör adları (örnek):</div>
        <div className="break-all">001-pleksi-1220x2440--2pcs--2800um-akpolimer-beyaz--{stamp}.{code}.pleksi-beyaz</div>
        <div className="break-all">002-pleksi-1220x2440--1pcs--2800um-akpolimer-siyah--{stamp}.ozturk-reklam.pleksi-siyah</div>
        {form.materialSaleFolders && (
          <div className="break-all">malzeme-{stamp}.{code}.pleksi-beyaz\m1220x2440-2adet</div>
        )}
        <div className="mt-1 font-sans text-xs text-slate-500">
          F + projenin gün klasörünün tarihi · malzemenin sahibi (müşterinin malıysa müşteri, değilse işletme kodu) · tür-renk.
          Malzeme satışında kesim olmadığı için tabaka klasörü açılmaz; satılan her ölçü bir <code>m</code> dosyasıdır
          (kullanılan parçadaki <code>u</code> dosyası gibi).
        </div>
      </div>
      <button className="btn-primary" disabled={!canWrite || save.isPending} onClick={() => save.mutate()}>
        {save.isPending && <Spinner />}
        Kaydet
      </button>
    </SubBox>
  );
}

/**
 * 🗂️ Katalog sağlığı: geçmişte oluşmuş tür/marka/renk kopyalarını bulur ve
 * birleştirir. Birleştirme yıkıcı değildir — bağlı stok/teklif/satış kayıtları
 * korunan katalog satırına taşınır.
 */
function CatalogHealthCard() {
  const qc = useQueryClient();
  // Kopya taraması bütün kataloğu dolaşır: yalnız kart görününce yapılır.
  const active = useSectionActive('katalog');
  const { data, isFetching } = useQuery({
    queryKey: ['catalog-duplicates'],
    queryFn: fetchCatalogDuplicates,
    enabled: active,
  });
  const mut = useMutation({
    mutationFn: dedupeCatalog,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-duplicates'] });
      qc.invalidateQueries({ queryKey: ['material-categories'] });
      qc.invalidateQueries({ queryKey: ['material-templates'] });
      qc.invalidateQueries({ queryKey: ['plates'] });
    },
  });

  const groups = data
    ? ([
        ['Ürün türü', data.categories],
        ['Marka', data.brands],
        ['Renk', data.colors],
        ['Ebat', data.sizes],
        ['Kalınlık', data.thicknesses],
        ['Şablon', data.templates],
      ] as const).filter(([, list]) => list.length > 0)
    : [];
  const total = groups.reduce((n, [, list]) => n + list.length, 0);

  const onMerge = async () => {
    if (
      await confirmDialog({
        title: 'Kopyalar birleştirilsin mi?',
        message:
          `${total} kopya kümesi birleştirilecek. Bağlı kayıtlar korunan ` +
          'katalog satırına taşınır, hiçbir stok/teklif/satış silinmez. Devam edilsin mi?',
        confirmText: 'Birleştir',
        danger: false,
      })
    ) {
      mut.mutate();
    }
  };

  return (
    <SettingsSection
      id="katalog"
      badge={
        data &&
        (total === 0 ? (
          <span className="badge bg-emerald-100 text-emerald-800">Temiz</span>
        ) : (
          <span className="badge bg-amber-100 text-amber-800">{total} kopya kümesi</span>
        ))
      }
    >
      <p className="text-sm text-slate-500">
        Aynı tür/marka/renk farklı yazımlarla birden çok kez açılmış olabilir
        ("Dekota", "dekota", " DEKOTA "). Birleştirme <b>veri kaybettirmez</b>:
        en eski kayıt korunur, kopyalara bağlı stok, teklif, satış ve cari
        kayıtları ona taşınır.
      </p>

      {isFetching && !data ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Spinner /> Taranıyor…
        </p>
      ) : total === 0 ? (
        <p className="text-sm text-emerald-700">✅ Kopya bulunamadı.</p>
      ) : (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            {total} kopya kümesi bulundu
          </p>
          {groups.map(([label, list]) => (
            <div key={label}>
              <span className="text-xs font-semibold text-slate-600">
                {label} ({list.length})
              </span>
              <ul className="ml-4 list-disc text-xs text-slate-600">
                {list.slice(0, 8).map((g) => (
                  <li key={g.keepId} className="break-words">
                    {g.label}{' '}
                    <span className="text-slate-400">
                      — {g.mergeIds.length} kopya birleşecek
                    </span>
                  </li>
                ))}
                {list.length > 8 && (
                  <li className="text-slate-400">… ve {list.length - 8} tane daha</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {mut.isSuccess && (
        <p className="text-sm text-emerald-700">
          {mut.data.merged} kopya birleştirildi.
        </p>
      )}
      {mut.isError && <p className="text-sm text-red-600">Birleştirilemedi.</p>}

      <button
        className="btn bg-amber-600 text-white hover:bg-amber-700"
        disabled={total === 0 || mut.isPending}
        onClick={() => void onMerge()}
      >
        {mut.isPending && <Spinner />}
        {mut.isPending ? 'Birleştiriliyor…' : 'Kopyaları birleştir'}
      </button>
    </SettingsSection>
  );
}

/**
 * 🧹 Bakım: biriken kayıtları ve log dosyalarını temizler.
 *
 * Uygulamanın kendi logları (bildirim defteri) ve disk yedekleri buradan
 * silinir. Docker log dosyaları container'a ait olduğu için konteynerin
 * içinden silinemez — o iş için depodaki clear-logs betiği kullanılır.
 */
function MaintenanceSection() {
  const qc = useQueryClient();
  const [keep, setKeep] = useState(5);
  const [copied, setCopied] = useState(false);

  const active = useSectionActive('bakim');
  const { data: notifStats } = useQuery({
    queryKey: ['notification-stats'],
    queryFn: fetchNotificationStats,
    enabled: active,
  });
  const { data: usage } = useQuery({
    queryKey: ['backup-usage'],
    queryFn: fetchBackupUsage,
    enabled: active,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notification-stats'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['backup-usage'] });
    qc.invalidateQueries({ queryKey: ['backups'] });
  };

  const clearNotifMut = useMutation({
    mutationFn: (days?: number) => clearNotifications(days),
    onSuccess: invalidate,
  });
  const cleanupBackupsMut = useMutation({
    mutationFn: (k: number) => cleanupBackups(k),
    onSuccess: invalidate,
  });

  const DOCKER_CMD =
    'docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d';

  return (
    <SettingsSection id="bakim">
      {/* Bildirim defteri */}
      <SubBox title="Bildirim geçmişi (uygulama logu)">
        <p className="text-xs text-slate-500">
          {notifStats
            ? `${notifStats.total} kayıt${
                notifStats.oldestAt
                  ? ` · en eskisi ${formatDate(notifStats.oldestAt)}`
                  : ''
              }`
            : 'Yükleniyor…'}
          . Yalnızca gönderim geçmişidir; silmek cari/stok/ödeme verisini
          etkilemez.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary btn-sm"
            disabled={clearNotifMut.isPending}
            onClick={() => clearNotifMut.mutate(30)}
          >
            30 günden eskileri sil
          </button>
          <button
            className="btn-danger-soft btn-sm"
            disabled={clearNotifMut.isPending}
            onClick={async () => {
              if (
                await confirmDialog({
                  message: 'Tüm bildirim geçmişi silinsin mi? İş verisi etkilenmez.',
                  confirmText: 'Tümünü sil',
                  danger: true,
                })
              ) {
                clearNotifMut.mutate(undefined);
              }
            }}
          >
            Tümünü sil
          </button>
        </div>
        {clearNotifMut.isSuccess && (
          <p className="text-xs text-emerald-700">
            {clearNotifMut.data.deleted} kayıt silindi.
          </p>
        )}
        {clearNotifMut.isError && (
          <p className="text-xs text-red-600">Silinemedi.</p>
        )}
      </SubBox>

      {/* Disk yedekleri */}
      <SubBox title="Sunucudaki yedek dosyaları">
        <p className="text-xs text-slate-500">
          {usage
            ? `${usage.files} dosya · ${humanSize(usage.totalBytes)}`
            : 'Yükleniyor…'}
          . En yeni dosyalar korunur; Telegram'a gönderilmiş yedekler etkilenmez.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Korunacak dosya:
            <input
              className="input w-24"
              type="number"
              inputMode="numeric"
              min={0}
              value={keep}
              onChange={(e) => setKeep(Math.max(0, Number(e.target.value)))}
            />
          </label>
          <button
            className="btn-danger-soft btn-sm"
            disabled={cleanupBackupsMut.isPending}
            onClick={async () => {
              const msg =
                keep > 0
                  ? `En yeni ${keep} yedek dışındaki dosyalar silinsin mi?`
                  : 'TÜM yedek dosyaları silinsin mi? (Veritabanı etkilenmez.)';
              if (await confirmDialog({ message: msg, confirmText: 'Sil', danger: true })) {
                cleanupBackupsMut.mutate(keep);
              }
            }}
          >
            Eski yedekleri sil
          </button>
        </div>
        {cleanupBackupsMut.isSuccess && (
          <p className="text-xs text-emerald-700">
            {cleanupBackupsMut.data.deleted} dosya silindi ·{' '}
            {humanSize(cleanupBackupsMut.data.freedBytes)} yer açıldı.
          </p>
        )}
        {cleanupBackupsMut.isError && (
          <p className="text-xs text-red-600">Silinemedi.</p>
        )}
      </SubBox>

      {/* Docker logları — konteyner içinden silinemez, komut/betik gerekir */}
      <SubBox title="Docker logları" className="border-slate-200 bg-slate-50">
        <p className="text-xs text-slate-500">
          Docker'ın log dosyaları container'a aittir ve uygulamanın içinden
          silinemez. Loglar artık kendiliğinden sınırlı (servis başına 3 × 10 MB),
          ama hemen boşaltmak isterseniz sunucuda{' '}
          <code className="rounded bg-white px-1">clear-logs.bat</code> dosyasına
          çift tıklayın ya da şu komutu çalıştırın. Veritabanı silinmez.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1.5 text-[11px]">
            {DOCKER_CMD}
          </code>
          <button
            className="btn-secondary btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(DOCKER_CMD);
                setCopied(true);
              } catch {
                setCopied(false);
                toast.error('Kopyalanamadı', 'Komutu seçip elle kopyalayın.');
              }
            }}
          >
            {copied ? '✓ Kopyalandı' : 'Kopyala'}
          </button>
        </div>
      </SubBox>
    </SettingsSection>
  );
}

/** Ayarın kaynağını gösteren küçük etiket (arayüzden mi, .env'den mi). */
function SourceBadge({ source }: { source: SettingSource }) {
  if (source === 'none') return null;
  const db = source === 'db';
  return (
    <span
      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
        db ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}
      title={
        db
          ? 'Bu değer arayüzden girildi (veritabanında saklanıyor).'
          : '.env dosyasından geliyor. Arayüzden girerseniz o değer öncelikli olur.'
      }
    >
      {db ? 'arayüz' : '.env'}
    </span>
  );
}

/**
 * Telegram ayarları. Jeton ve sohbet kimlikleri buradan düzenlenir; değişiklik
 * ANINDA geçerli olur (gönderim anında okunur), container'ı yeniden başlatmaya
 * gerek yoktur. "Yeniden başlat" jetonu Telegram'a doğrulatır.
 */
function TelegramSettings() {
  const qc = useQueryClient();
  // Bot jetonu, yedek sohbeti ve yetkili kullanıcılar bütün sistemindir
  // (tek bot tüm dükkânlara hizmet eder): yalnız sistem sahibi değiştirir.
  // Bildirim sohbeti dükkânındır.
  const { isOwner } = useAuth();
  const active = useSectionActive('telegram');
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'telegram'],
    queryFn: fetchTelegramSettings,
    enabled: active,
  });

  // Jeton hiç açık gelmez → boş bırakılırsa mevcut jeton korunur.
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [backupChatId, setBackupChatId] = useState('');
  const [allowedIds, setAllowedIds] = useState('');
  // Konu başına hedef: bildirim sohbeti, başka sohbet ya da kapalı.
  const [routes, setRoutes] = useState<Partial<Record<TelegramTopic, { mode: TelegramRoute['mode']; chatId: string }>>>({});
  useEffect(() => {
    if (data) {
      setChatId(data.chatIdSource === 'db' ? data.chatId : '');
      setBackupChatId(data.backupChatId);
      setAllowedIds(data.allowedUserIds.join(', '));
      setRoutes(Object.fromEntries((data.routes ?? []).map((r) => [r.topic, { mode: r.mode, chatId: r.chatId }])));
    }
  }, [data]);
  const routePayload = () =>
    Object.fromEntries(
      Object.entries(routes)
        .filter(([, r]) => r && (r.mode === 'off' || (r.mode === 'chat' && r.chatId.trim())))
        .map(([k, r]) => [k, r!.mode === 'off' ? { off: true } : { chatId: r!.chatId.trim() }]),
    );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['settings', 'telegram'] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      updateTelegramSettings(
        isOwner
          ? {
              // Boş jeton "değiştirme" demek; temizlemek için ayrı düğme var.
              ...(token.trim() ? { telegramBotToken: token.trim() } : {}),
              telegramChatId: chatId.trim(),
              telegramRoutes: routePayload(),
              backupTelegramChatId: backupChatId.trim(),
              telegramAllowedUserIds: allowedIds,
            }
          : { telegramChatId: chatId.trim(), telegramRoutes: routePayload() },
      ),
    onSuccess: () => {
      setToken('');
      invalidate();
    },
  });
  const clearTokenMut = useMutation({
    mutationFn: () => updateTelegramSettings({ telegramBotToken: '' }),
    onSuccess: invalidate,
  });
  const reloadMut = useMutation({ mutationFn: reloadTelegram, onSuccess: invalidate });
  const testMut = useMutation({ mutationFn: (topic?: TelegramTopic) => testTelegram(topic) });

  if (isLoading || !data) {
    return (
      <SettingsSection id="telegram">
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Spinner /> Telegram ayarları yükleniyor…
        </p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      id="telegram"
      badge={
        data.configured ? (
          <span className="badge bg-emerald-100 text-emerald-800">Yapılandırıldı</span>
        ) : (
          <span className="badge bg-amber-100 text-amber-800">Eksik</span>
        )
      }
    >
      <p className="text-sm text-slate-500">
        Bildirimler, borç hatırlatmaları ve şifreli yedekler bu bot üzerinden
        gönderilir. Buradaki değişiklikler <b>anında</b> geçerli olur — sunucuyu
        veya container'ı yeniden başlatmanız gerekmez.
      </p>

      {/* Durum + mesajın gideceği sohbet */}
      <div
        className={`space-y-1 rounded-xl border p-3 text-sm ${
          data.configured
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
            : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
        }`}
      >
        <p className="font-medium">
          {data.configured ? '✅ Yapılandırıldı' : '⚠️ Eksik yapılandırma'}
        </p>
        <p className="break-words text-xs text-slate-600">
          Bot jetonu:{' '}
          {data.tokenSet ? (
            <>
              <code className="rounded bg-white px-1">{data.tokenMasked}</code>
              <SourceBadge source={data.tokenSource} />
            </>
          ) : (
            <span className="text-amber-700">tanımlı değil</span>
          )}
        </p>
        <p className="break-words text-xs text-slate-600">
          Bildirimler şu sohbete gider:{' '}
          {data.chatId ? (
            <>
              <code className="rounded bg-white px-1">{data.chatId}</code>
              <SourceBadge source={data.chatIdSource} />
            </>
          ) : (
            <span className="text-amber-700">tanımlı değil</span>
          )}
        </p>
        <p className="break-words text-xs text-slate-600">
          Şifreli yedek şu sohbete gider:{' '}
          {data.effectiveBackupChatId ? (
            <code className="rounded bg-white px-1">
              {data.effectiveBackupChatId}
            </code>
          ) : (
            <span className="text-amber-700">tanımlı değil</span>
          )}
          {!data.backupChatId && data.effectiveBackupChatId && (
            <span className="ml-1 text-slate-400">
              (ayrı yedek sohbeti girilmedi → bildirim sohbeti kullanılıyor)
            </span>
          )}
        </p>
        <p className="break-words text-xs text-slate-400">
          Otomatik yedek gönderim sıklığı (cron): <code>{data.backupCron}</code>{' '}
          — bu değer .env'den okunur ve değişikliği yeniden başlatma ister.
        </p>
      </div>

      <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
        💡 <b>Kimlikleri bulmak için:</b> botu gruba ekleyin ve gruba{' '}
        <code className="rounded bg-white px-1">/idx</code> yazın. Bot, o grubun
        kimliğini <b>ve sizin kullanıcı kimliğinizi</b> dokunup kopyalayabileceğiniz
        şekilde cevaplar — mobilde aramanıza gerek kalmaz. Bot menüsü için{' '}
        <code className="rounded bg-white px-1">/menu</code> yazın.
      </p>

      {!isOwner && (
        <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
          Bu dükkân için yalnız bildirim sohbetini değiştirebilirsiniz; bot jetonu, yedek sohbeti ve yetkili
          kullanıcılar bütün sistemin ayarıdır (sistem sahibi).
        </p>
      )}
      <Field
        label="Bot jetonu"
        value={token}
        disabled={!isOwner}
        onChange={setToken}
        placeholder={
          data.tokenSet ? 'Değiştirmek için yeni jetonu yapıştırın' : '123456789:AA…'
        }
        hint="@BotFather'dan alınır. Boş bırakırsanız mevcut jeton korunur; ekranda hiçbir zaman açık gösterilmez."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Bu dükkânın bildirim sohbeti (chat id)"
          value={chatId}
          onChange={setChatId}
          placeholder={data.chatIdSource === 'env' ? data.chatId : '-1001234567890'}
          hint={
            data.chatSharedWith?.length
              ? `Bu sohbeti ${data.chatSharedWith.join(', ')} de kullanıyor; mesajların başında dükkân adı yazar.`
              : 'Aşağıda başka sohbet seçilmeyen bildirimler buraya gider. Boşsa .env’deki değer kullanılır.'
          }
        />
        <Field
          label="Yedek sohbet kimliği (opsiyonel)"
          value={backupChatId}
          disabled={!isOwner}
          onChange={setBackupChatId}
          placeholder="Boşsa bildirim sohbeti kullanılır"
          hint="Yedekleri ayrı bir gruba göndermek isterseniz."
        />
      </div>

      {/* Konu başına hedef: her dükkân her konuyu ayrı kanala, ortak kanala ya da hiçbir yere. */}
      <SubBox title="📬 Hangi bildirim nereye gitsin?">
        <p className="text-xs text-slate-500">
          Her konu bu dükkânın bildirim sohbetine, başka bir sohbete (kanal/grup) gidebilir ya da kapatılabilir.
          Dükkânlar aynı sohbeti paylaşabilir; birden çok dükkân varken mesajın ilk satırında dükkân adı yazar.
          Müşterinin kendi Telegram sohbetine giden mesajlar bundan etkilenmez.
        </p>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {(data.routes ?? []).map((r) => {
            const cur = routes[r.topic] ?? { mode: r.mode, chatId: r.chatId };
            const setCur = (patch: Partial<typeof cur>) =>
              setRoutes((all) => ({ ...all, [r.topic]: { ...cur, ...patch } }));
            return (
              <div key={r.topic} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:w-56">
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="text-xs text-slate-500">{r.hint}</div>
                </div>
                <select
                  className="input sm:w-44"
                  aria-label={`${r.label} hedefi`}
                  value={cur.mode}
                  onChange={(e) => setCur({ mode: e.target.value as TelegramRoute['mode'] })}
                >
                  <option value="default">Bildirim sohbeti</option>
                  <option value="chat">Başka sohbet</option>
                  <option value="off">Kapalı</option>
                </select>
                {cur.mode === 'chat' && (
                  <input
                    className="input min-w-0 flex-1 font-mono text-sm"
                    aria-label={`${r.label} sohbet kimliği`}
                    placeholder="-1001234567890"
                    value={cur.chatId}
                    onChange={(e) => setCur({ chatId: e.target.value })}
                  />
                )}
                <div className="flex items-center gap-2 sm:ml-auto">
                  {r.sharedWith.length > 0 && cur.mode === r.mode && (
                    <span className="badge bg-slate-100 text-slate-600" title="Aynı sohbete gönderen dükkânlar">
                      ortak: {r.sharedWith.join(', ')}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={testMut.isPending || !data.tokenSet || r.mode === 'off' || cur.mode !== r.mode}
                    title={
                      cur.mode !== r.mode
                        ? 'Önce kaydedin'
                        : r.mode === 'off'
                          ? 'Bu konu kapalı'
                          : `${r.effectiveChatId || '—'} sohbetine deneme mesajı`
                    }
                    onClick={() => testMut.mutate(r.topic)}
                  >
                    ✉️ Dene
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SubBox>

      {/* Bot üzerinden İŞLEM yapabilecek kullanıcılar — güvenlik kapısı. */}
      <SubBox
        title={<span className="text-amber-800 dark:text-amber-300">🔐 Yetkili kullanıcılar (bot üzerinden işlem yapabilecekler)</span>}
        className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
      >
        <p className="text-xs text-slate-600">
          Telegram'dan tahsilat girme, borç kapatma gibi işlemleri <b>yalnızca</b>{' '}
          buradaki kullanıcı kimlikleri yapabilir. Liste boşken hiç kimse yetkili
          değildir. Kimliğinizi öğrenmek için bota{' '}
          <code className="rounded bg-white px-1">/idx</code> yazın — sohbet
          kimliğinin yanında kendi kullanıcı kimliğinizi de söyler.
        </p>
        <input
          className="input font-mono text-sm"
          value={allowedIds}
          disabled={!isOwner}
          aria-label="Yetkili kullanıcı kimlikleri"
          placeholder="Örn. 123456789, 987654321"
          onChange={(e) => setAllowedIds(e.target.value)}
        />
        <p className="text-xs text-slate-600">
          Bu kişiler botta bütün dükkânlara erişir; ana menüdeki dükkân düğmesiyle dükkân değiştirir.
          Yalnız kendi dükkânını görmesi gereken çalışanın kimliğini buraya değil,{' '}
          <b>Ekip</b> ekranında hesabına yazın: bot ona yalnız üye olduğu dükkânları, kendi izinleriyle gösterir.
        </p>
        {data.allowedUserIds.length === 0 && (
          <p className="text-xs font-medium text-amber-800">
            ⚠️ Şu an hiç yetkili kullanıcı yok — bot işlem yapmıyor.
          </p>
        )}
      </SubBox>

      {saveMut.isError && (
        <p className="text-sm text-red-600">
          {(saveMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Kaydedilemedi.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending && <Spinner />}
          Kaydet
        </button>
        {isOwner && (
          <button
            className="btn-secondary"
            disabled={reloadMut.isPending}
            title="Ayarları yeniden okur ve jetonu Telegram'a doğrulatır"
            onClick={() => reloadMut.mutate()}
          >
            {reloadMut.isPending ? 'Yeniden başlatılıyor…' : '🔄 Yeniden başlat'}
          </button>
        )}
        <button
          className="btn-secondary"
          disabled={testMut.isPending || !data.configured}
          title={
            data.configured
              ? 'Ayarlardaki sohbete deneme mesajı gönderir'
              : 'Önce jeton ve sohbet kimliğini tanımlayın'
          }
          onClick={() => testMut.mutate(undefined)}
        >
          {testMut.isPending ? 'Gönderiliyor…' : '✉️ Test mesajı gönder'}
        </button>
        {isOwner && data.tokenSource === 'db' && (
          <button
            className="btn-danger-soft btn-sm sm:ml-auto"
            disabled={clearTokenMut.isPending}
            title="Arayüzden girilen jetonu siler; varsa .env değerine geri dönülür"
            onClick={async () => {
              if (
                await confirmDialog({
                  message: 'Arayüzden girilen bot jetonu silinsin mi? Varsa .env değeri devreye girer.',
                  confirmText: 'Jetonu temizle',
                  danger: true,
                })
              ) {
                clearTokenMut.mutate();
              }
            }}
          >
            Jetonu temizle
          </button>
        )}
      </div>

      {/* Yeniden başlatma sonucu */}
      {reloadMut.isSuccess && (
        <p
          className={`break-words text-sm ${
            reloadMut.data.ok ? 'text-emerald-700' : 'text-red-600'
          }`}
        >
          {reloadMut.data.ok ? (
            <>
              Bağlantı tamam — bot{' '}
              <b>@{reloadMut.data.botUsername ?? reloadMut.data.botName}</b>.
              Mesajlar <code>{reloadMut.data.chatId || '—'}</code>, yedekler{' '}
              <code>{reloadMut.data.backupChatId || '—'}</code> sohbetine gidecek.
            </>
          ) : (
            <>Bağlanılamadı: {reloadMut.data.error}</>
          )}
        </p>
      )}
      {reloadMut.isError && (
        <p className="text-sm text-red-600">Yeniden başlatılamadı.</p>
      )}

      {/* Test sonucu */}
      {testMut.isSuccess && (
        <p
          className={`break-words text-sm ${
            testMut.data.success ? 'text-emerald-700' : 'text-red-600'
          }`}
        >
          {testMut.data.success
            ? `Test mesajı ${testMut.data.chatId} sohbetine gönderildi.`
            : `Gönderilemedi: ${testMut.data.error}`}
        </p>
      )}
      {testMut.isError && (
        <p className="text-sm text-red-600">Test mesajı gönderilemedi.</p>
      )}
    </SettingsSection>
  );
}

/**
 * Ekran kilidi ayarları: hareketsizlik süresi + sayısal PIN + etkinleştirme.
 * Kilit cihaz bazında (localStorage) tutulur; PIN hash'lenerek saklanır.
 */
function ScreenLockSettings() {
  const { config, updateConfig, lock, ready } = useLock();
  const [enabled, setEnabled] = useState(config.enabled);
  const [minutes, setMinutes] = useState(String(config.minutes));
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    setErr(null);
    const mins = Math.max(1, Number(minutes) || 0);
    // PIN yalnızca değiştirilmek istenirse gönderilir. Etkinleştiriliyor ama hiç
    // PIN tanımlı değilse yeni PIN zorunludur.
    const digits = pin.replace(/\D/g, '');
    if (enabled && !config.pinHash && digits.length < 4) {
      setErr('Kilidi etkinleştirmek için en az 4 haneli sayısal bir PIN girin.');
      return;
    }
    if (digits && digits.length < 4) {
      setErr('PIN en az 4 haneli olmalıdır.');
      return;
    }
    updateConfig({
      enabled,
      minutes: mins,
      ...(digits ? { pin: digits } : {}),
    });
    setPin('');
    // Sunucuya gitmeyen (cihazdaki) bir ayar: otomatik bildirim yok, burada söylenir.
    toast.success('Ekran kilidi ayarları kaydedildi', 'Bu cihazda geçerli.');
  };

  return (
    <SettingsSection id="kilit" badge={<OnOffBadge on={config.enabled} />}>
      <p className="text-sm text-slate-500">
        Belirlenen süre boyunca işlem yapılmazsa arayüz otomatik kilitlenir ve
        yalnızca PIN ile açılır. PIN {config.pinLen ? `(${config.pinLen} haneli) ` : ''}
        bu cihazda saklanır (kolaylık amaçlı; gerçek güvenlik katmanı değildir).
        PIN uzunluğu kadar rakam girildiğinde Enter'a gerek kalmadan doğrulanır.
      </p>

      <label
        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-medium transition ${
          enabled ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-slate-200'
        }`}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Ekran kilidini etkinleştir
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="label">Kilitlenme süresi (dakika)</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <label className="block min-w-0">
          <span className="label">
            {config.pinHash ? 'Yeni PIN (değiştirmek için)' : 'PIN (sayısal)'}
          </span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder={config.pinHash ? '•••• (tanımlı)' : 'Örn. 1234'}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={save}>
          Kaydet
        </button>
        {ready && (
          <button className="btn-secondary" onClick={lock}>
            🔒 Şimdi kilitle
          </button>
        )}
      </div>
    </SettingsSection>
  );
}

/** İnsan-okur boyut (KB/MB). */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * #6 Veritabanı yedekleme/geri yükleme. "Yedek indir" anlık .sql üretip indirir;
 * "Geri yükle" yüklenen .sql'i uygular (ÇİFT ONAYLI — veriyi üzerine yazar).
 * Ayrıca sunucudaki otomatik yedeklerin listesi gösterilir.
 */
function BackupSection() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const active = useSectionActive('yedek');
  const { data: backups } = useQuery({
    queryKey: ['backups'],
    queryFn: fetchBackups,
    enabled: active,
  });
  const { data: tgState } = useQuery({
    queryKey: ['telegram-backup-state'],
    queryFn: fetchTelegramBackupState,
    enabled: active,
  });

  const downloadMut = useMutation({ mutationFn: () => downloadBackup() });
  const sendTelegramMut = useMutation({
    mutationFn: () => sendBackupToTelegram(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['telegram-backup-state'] });
    },
  });
  // Şifreli (.enc) yedekte: önce sunucunun kendi anahtarı denenir; çözemezse
  // aşağıdaki alan açılır ve kullanıcıdan şifre çözme anahtarı istenir.
  const [keyPrompt, setKeyPrompt] = useState(false);
  const [manualKey, setManualKey] = useState('');

  const restoreMut = useMutation({
    mutationFn: ({ file, key }: { file: File; key?: string }) =>
      restoreBackup(file, key),
    onSuccess: () => {
      setRestoreFile(null);
      setKeyPrompt(false);
      setManualKey('');
      if (fileRef.current) fileRef.current.value = '';
      // Geri yükleme sonrası tüm veri değişebilir → önbelleği tazele.
      qc.invalidateQueries();
    },
    onError: (err) => {
      // Sunucunun anahtarı yetmedi → kullanıcıdan iste.
      if (restoreNeedsKey(err)) setKeyPrompt(true);
    },
  });

  async function handleRestore(key?: string) {
    if (!restoreFile) return;
    if (
      !(await confirmDialog({
        title: 'Geri yükleme',
        message:
          'DİKKAT: Geri yükleme MEVCUT verinin üzerine yazabilir ve geri alınamaz. ' +
          'Devam etmeden önce güncel bir yedek indirmeniz önerilir. Devam edilsin mi?',
        confirmText: 'Devam et',
        danger: true,
      }))
    )
      return;
    if (
      !(await confirmDialog({
        title: 'Son onay',
        message: `Son onay: "${restoreFile.name}" yedeği veritabanına uygulanacak. Emin misiniz?`,
        confirmText: 'Geri yükle',
        danger: true,
      }))
    )
      return;
    restoreMut.mutate({ file: restoreFile, key });
  }

  return (
    <SettingsSection id="yedek">
      <p className="text-sm text-slate-500">
        Anlık yedek indirin ya da bir yedek dosyasından geri yükleyin. Sunucu ayrıca
        düzenli aralıklarla otomatik yedek alır (sonuç bildirim geçmişine düşer).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary"
          disabled={downloadMut.isPending}
          onClick={() => downloadMut.mutate()}
        >
          {downloadMut.isPending && <Spinner />}
          {downloadMut.isPending ? 'Hazırlanıyor…' : '⬇️ Yedek indir (.sql)'}
        </button>
      </div>
      {downloadMut.isError && (
        <p className="text-sm text-red-600">
          {(downloadMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Yedek indirilemedi.'}
        </p>
      )}

      {/* 🔐 Şifreli yedeğin Telegram'a gönderimi (saatlik otomatik + elle). */}
      <SubBox
        title={<span className="text-indigo-800 dark:text-indigo-300">🔐 Şifreli yedek · Telegram</span>}
        className="border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30"
      >
        <p className="text-xs text-slate-600">
          Sunucu, arka planda saatlik olarak yedeği şifreleyip Telegram'a gönderir
          ve gün içindeki tüm yedekleri <b>tek bir mesajda</b> toplayıp günceller
          (mesaj sohbette sabitlenir). Aşağıdaki düğmeyle elle de gönderebilirsiniz.
        </p>
        <button
          className="btn bg-indigo-600 text-white hover:bg-indigo-700"
          disabled={sendTelegramMut.isPending}
          onClick={() => sendTelegramMut.mutate()}
        >
          {sendTelegramMut.isPending && <Spinner />}
          {sendTelegramMut.isPending
            ? 'Gönderiliyor…'
            : '📤 Şifreli yedeği Telegram’a gönder'}
        </button>
        {sendTelegramMut.isError && (
          <p className="text-sm text-red-600">
            {(sendTelegramMut.error as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ??
              'Gönderilemedi. Telegram bot jetonu ve sohbet kimliği tanımlı mı?'}
          </p>
        )}
        {sendTelegramMut.isSuccess && (
          <p className="text-sm text-emerald-700">
            {sendTelegramMut.data.action === 'created'
              ? 'Yeni günlük mesaj gönderildi ve sabitlendi.'
              : 'Günlük mesaj güncellendi (yedek eklendi).'}{' '}
            Bu güne ait {sendTelegramMut.data.entryCount}. yedek.
          </p>
        )}

        {tgState?.entries?.length ? (
          <div className="mt-1">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Bugünkü Telegram yedekleri ({formatDate(tgState.dayKey, tgState.dayKey)})
            </span>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-xs">
              {tgState.entries.map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className="flex items-center justify-between gap-2 px-3 py-1.5"
                >
                  <span>
                    {i + 1}){' '}
                    {new Date(e.at).toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {e.kind === 'manual' ? 'manuel' : 'otomatik'}
                  </span>
                  <span className="shrink-0 text-slate-400">{humanSize(e.size)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DecryptionKeyPanel />
      </SubBox>

      <SubBox
        title={<span className="text-red-700 dark:text-red-300">⚠️ Geri yükle (tehlikeli)</span>}
        className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
      >
        <p className="text-xs text-slate-600">
          Düz <code>.sql</code> yedeği veya Telegram'dan indirdiğiniz şifreli{' '}
          <code>.enc</code> dosyasını seçin. Şifreli dosyada önce sunucudaki
          geçerli şifre çözme anahtarı denenir; yedek eski bir anahtarla
          şifrelenmişse anahtar sizden istenir.
        </p>
        <input
          ref={fileRef}
          className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 file:shadow-sm"
          type="file"
          accept=".sql,.enc"
          aria-label="Geri yüklenecek yedek dosyası"
          onChange={(e) => {
            setRestoreFile(e.target.files?.[0] ?? null);
            setKeyPrompt(false);
            setManualKey('');
            restoreMut.reset();
          }}
        />
        <button
          className="btn-danger"
          disabled={!restoreFile || restoreMut.isPending}
          onClick={() => void handleRestore()}
        >
          {restoreMut.isPending && <Spinner />}
          {restoreMut.isPending ? 'Geri yükleniyor…' : 'Seçili yedeği geri yükle'}
        </button>

        {/* Sunucunun anahtarı çözemedi → kullanıcıdan anahtarı iste. */}
        {keyPrompt && (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
            <p className="text-xs text-amber-800">
              Bu yedek, sunucudaki geçerli anahtarla çözülemedi. Yedeğin
              alındığı dönemin <b>şifre çözme anahtarını</b> yapıştırın —
              Telegram'daki yedek mesajında ya da o dönem kaydettiğiniz
              "Şifre çözme anahtarı" panelinde bulunur.
            </p>
            <textarea
              className="input h-28 w-full py-2 font-mono text-[11px] md:text-[11px]"
              placeholder="-----BEGIN PRIVATE KEY-----&#10;…&#10;-----END PRIVATE KEY-----"
              aria-label="Şifre çözme anahtarı"
              value={manualKey}
              onChange={(e) => setManualKey(e.target.value)}
            />
            <button
              className="btn-danger"
              disabled={!manualKey.trim() || restoreMut.isPending}
              onClick={() => void handleRestore(manualKey)}
            >
              {restoreMut.isPending
                ? 'Çözülüyor…'
                : 'Bu anahtarla çöz ve geri yükle'}
            </button>
          </div>
        )}

        {restoreMut.isError && (
          <p className="text-sm text-red-700">
            {(restoreMut.error as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Geri yükleme başarısız.'}
          </p>
        )}
        {restoreMut.isSuccess && (
          <p className="text-sm text-emerald-700">
            Geri yükleme tamamlandı
            {restoreMut.data?.decrypted ? ' (şifreli yedek çözüldü).' : '.'}
          </p>
        )}
      </SubBox>

      {!!backups?.length && (
        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-600">
            Sunucudaki otomatik yedekler
          </span>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {backups.map((b) => (
              <li
                key={b.name}
                className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
              >
                <span className="min-w-0 truncate font-medium">{b.name}</span>
                <span className="shrink-0 text-xs text-slate-400 sm:text-sm">
                  {formatDateTime(b.createdAt)} · {humanSize(b.size)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SettingsSection>
  );
}

/**
 * Şifre çözme (private) anahtarı paneli. Talep üzerine sunucudan çekilir ve
 * gösterilir. Bu anahtarla Telegram'a giden / indirilen şifreli (.enc) yedekler
 * çözülür. Anahtar API'da bir dosyada saklanır; burada yalnızca sahibe gösterilir.
 */
function DecryptionKeyPanel() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['backup-decryption-key'],
    queryFn: fetchDecryptionKey,
    enabled: open,
  });

  const copy = async () => {
    if (!data?.privateKeyPem) return;
    try {
      await navigator.clipboard.writeText(data.privateKeyPem);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      toast.error('Kopyalanamadı', 'Anahtarı seçip elle kopyalayın.');
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
      <button
        className="text-xs font-medium text-indigo-700 underline"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refetch();
        }}
      >
        {open ? 'Şifre çözme anahtarını gizle' : '🔑 Şifre çözme anahtarını göster'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-slate-600">
            Bu <b>özel (private)</b> anahtar, şifreli yedekleri çözmenizi sağlar.
            Güvenli bir yerde saklayın; kaybederseniz Telegram'daki yedekler
            açılamaz. Şifreleme (public) anahtarı sunucuda ayrı bir dosyada tutulur.
          </p>
          {isLoading && (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Spinner className="h-3.5 w-3.5" /> Yükleniyor…
            </p>
          )}
          {isError && (
            <p className="text-xs text-red-600">Anahtar alınamadı.</p>
          )}
          {data && (
            <>
              <textarea
                className="input h-40 w-full py-2 font-mono text-[11px] md:text-[11px]"
                readOnly
                aria-label="Şifre çözme anahtarı"
                value={data.privateKeyPem}
                onFocus={(e) => e.target.select()}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-secondary btn-sm" onClick={copy}>
                  {copied ? '✓ Kopyalandı' : 'Anahtarı kopyala'}
                </button>
                <span className="break-all text-[11px] text-slate-400">
                  Public parmak izi: {data.publicKeyFingerprint.slice(0, 23)}…
                </span>
              </div>
              <div className="rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                <p className="font-medium">Çözme (bilgisayarda):</p>
                <p>1) Bu anahtarı <code>backup-key.priv.pem</code> olarak kaydedin.</p>
                <p>
                  2) Depodaki betiği çalıştırın:
                  <br />
                  <code className="break-all">
                    node scripts/decrypt-backup.mjs yedek.sql.enc backup-key.priv.pem
                    yedek.sql
                  </code>
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Gönderim durumunun okunur adı ve rengi. */
const NOTIF_STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: 'gönderildi', cls: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'başarısız', cls: 'bg-red-100 text-red-700' },
  pending: { label: 'bekliyor', cls: 'bg-amber-100 text-amber-800' },
};

/** #6 Bildirim geçmişi (gönderim defteri) — yedek/borç/stok bildirimleri burada. */
function NotificationsHistory() {
  const active = useSectionActive('bildirimler');
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications(50),
    enabled: active,
  });

  return (
    <SettingsSection
      id="bildirimler"
      badge={!!data?.length && <span className="badge bg-slate-100 text-slate-600">son {data.length}</span>}
    >
      {isLoading && (
        <div className="space-y-2" role="status" aria-label="Yükleniyor">
          <div className="skeleton h-12" />
          <div className="skeleton h-12" />
        </div>
      )}
      {!isLoading && !data?.length && (
        <EmptyState
          compact
          icon="🔕"
          title="Henüz bildirim yok."
          hint="Yedek, borç hatırlatması ve sabah özeti gönderildikçe burada listelenir."
        />
      )}
      {!!data?.length && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {data.map((n) => {
            const st = NOTIF_STATUS[n.status] ?? { label: n.status, cls: 'bg-slate-100 text-slate-600' };
            return (
              <li key={n.id} className="space-y-1 px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
                  <span className="min-w-0 break-words font-medium">{n.subject ?? n.type}</span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatDateTime(n.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-line break-words text-slate-600">{n.body}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="badge bg-slate-100 text-slate-600">{n.channel}</span>
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                  {n.error && <span className="break-words text-red-500">{n.error}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}

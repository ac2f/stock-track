import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBusinessSettings,
  fetchTelegramSettings,
  reloadTelegram,
  testTelegram,
  updateBusinessSettings,
  updateTelegramSettings,
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
import { useLock } from '../../context/LockContext';

/** Etiketli form alanı. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

/**
 * Ayarlar (İşletme Sahibi). İşletme/proje kimliği tek ekrandan düzenlenir;
 * PDF/yazdırma belgelerinde ve arayüz başlığında bu ad/bilgiler kullanılır.
 */
export function SettingsPage() {
  const qc = useQueryClient();
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

  if (isLoading) return <p className="text-slate-400">Yükleniyor…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Ayarlar — İşletme / Proje Kimliği</h1>
      <p className="text-sm text-slate-500">
        Buradaki ad ve bilgiler tüm PDF/yazdırma belgelerinde (teklif, fatura,
        fiş, ekstre, raporlar) ve uygulama başlığında kullanılır.
      </p>

      <div className="card space-y-3">
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
            onChange={(v) => set({ businessPhone: v })}
          />
          <Field
            label="Vergi No (VKN)"
            value={form.businessTaxNo ?? ''}
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
          onChange={(v) => set({ portalBaseUrl: v })}
          hint="Örn. http://192.168.1.50:5173/portal"
        />

        {mut.isError && (
          <p className="text-sm text-red-600">
            {(mut.error as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Kaydedilemedi.'}
          </p>
        )}
        {mut.isSuccess && (
          <p className="text-sm text-emerald-600">Kaydedildi.</p>
        )}

        <button
          className="btn-primary"
          disabled={mut.isPending}
          onClick={() => mut.mutate()}
        >
          Kaydet
        </button>
      </div>

      <ScreenLockSettings />
      <TelegramSettings />
      <BackupSection />
      <MaintenanceSection />
      <NotificationsHistory />
    </div>
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

  const { data: notifStats } = useQuery({
    queryKey: ['notification-stats'],
    queryFn: fetchNotificationStats,
  });
  const { data: usage } = useQuery({
    queryKey: ['backup-usage'],
    queryFn: fetchBackupUsage,
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
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold">🧹 Bakım — kayıt ve log temizliği</h2>

      {/* Bildirim defteri */}
      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <span className="block text-sm font-semibold">
          Bildirim geçmişi (uygulama logu)
        </span>
        <p className="text-xs text-slate-500">
          {notifStats
            ? `${notifStats.total} kayıt${
                notifStats.oldestAt
                  ? ` · en eskisi ${notifStats.oldestAt.slice(0, 10)}`
                  : ''
              }`
            : 'Yükleniyor…'}
          . Yalnızca gönderim geçmişidir; silmek cari/stok/ödeme verisini
          etkilemez.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn bg-slate-100 text-xs"
            disabled={clearNotifMut.isPending}
            onClick={() => clearNotifMut.mutate(30)}
          >
            30 günden eskileri sil
          </button>
          <button
            className="btn bg-red-50 text-xs text-red-600"
            disabled={clearNotifMut.isPending}
            onClick={() => {
              if (confirm('Tüm bildirim geçmişi silinsin mi? İş verisi etkilenmez.')) {
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
      </div>

      {/* Disk yedekleri */}
      <div className="space-y-2 rounded-lg border border-slate-200 p-3">
        <span className="block text-sm font-semibold">Sunucudaki yedek dosyaları</span>
        <p className="text-xs text-slate-500">
          {usage
            ? `${usage.files} dosya · ${humanSize(usage.totalBytes)}`
            : 'Yükleniyor…'}
          . En yeni dosyalar korunur; Telegram'a gönderilmiş yedekler etkilenmez.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500">
            Korunacak dosya:{' '}
            <input
              className="input w-20"
              type="number"
              min={0}
              value={keep}
              onChange={(e) => setKeep(Math.max(0, Number(e.target.value)))}
            />
          </label>
          <button
            className="btn bg-red-50 text-xs text-red-600"
            disabled={cleanupBackupsMut.isPending}
            onClick={() => {
              const msg =
                keep > 0
                  ? `En yeni ${keep} yedek dışındaki dosyalar silinsin mi?`
                  : 'TÜM yedek dosyaları silinsin mi? (Veritabanı etkilenmez.)';
              if (confirm(msg)) cleanupBackupsMut.mutate(keep);
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
      </div>

      {/* Docker logları — konteyner içinden silinemez, komut/betik gerekir */}
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <span className="block text-sm font-semibold">Docker logları</span>
        <p className="text-xs text-slate-500">
          Docker'ın log dosyaları container'a aittir ve uygulamanın içinden
          silinemez. Loglar artık kendiliğinden sınırlı (servis başına 3 × 10 MB),
          ama hemen boşaltmak isterseniz sunucuda{' '}
          <code className="rounded bg-white px-1">clear-logs.bat</code> dosyasına
          çift tıklayın ya da şu komutu çalıştırın. Veritabanı silinmez.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-1 text-[11px]">
            {DOCKER_CMD}
          </code>
          <button
            className="btn bg-slate-100 text-xs"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(DOCKER_CMD);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? '✓ Kopyalandı' : 'Kopyala'}
          </button>
        </div>
      </div>
    </div>
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
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'telegram'],
    queryFn: fetchTelegramSettings,
  });

  // Jeton hiç açık gelmez → boş bırakılırsa mevcut jeton korunur.
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [backupChatId, setBackupChatId] = useState('');
  useEffect(() => {
    if (data) {
      setChatId(data.chatIdSource === 'db' ? data.chatId : '');
      setBackupChatId(data.backupChatId);
    }
  }, [data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['settings', 'telegram'] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      updateTelegramSettings({
        // Boş jeton "değiştirme" demek; temizlemek için ayrı düğme var.
        ...(token.trim() ? { telegramBotToken: token.trim() } : {}),
        telegramChatId: chatId.trim(),
        backupTelegramChatId: backupChatId.trim(),
      }),
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
  const testMut = useMutation({ mutationFn: testTelegram });

  if (isLoading || !data) {
    return (
      <div className="card">
        <p className="text-slate-400">Telegram ayarları yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold">📨 Telegram</h2>
      <p className="text-sm text-slate-500">
        Bildirimler, borç hatırlatmaları ve şifreli yedekler bu bot üzerinden
        gönderilir. Buradaki değişiklikler <b>anında</b> geçerli olur — sunucuyu
        veya container'ı yeniden başlatmanız gerekmez.
      </p>

      {/* Durum + mesajın gideceği sohbet */}
      <div
        className={`space-y-1 rounded-lg border p-3 text-sm ${
          data.configured
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-amber-200 bg-amber-50'
        }`}
      >
        <p className="font-medium">
          {data.configured ? '✅ Yapılandırıldı' : '⚠️ Eksik yapılandırma'}
        </p>
        <p className="text-xs text-slate-600">
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
        <p className="text-xs text-slate-600">
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
        <p className="text-xs text-slate-600">
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
        <p className="text-xs text-slate-400">
          Otomatik yedek gönderim sıklığı (cron): <code>{data.backupCron}</code>{' '}
          — bu değer .env'den okunur ve değişikliği yeniden başlatma ister.
        </p>
      </div>

      <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
        💡 <b>Sohbet kimliğini bulmak için:</b> botu gruba ekleyin ve gruba{' '}
        <code className="rounded bg-white px-1">/idx</code> yazın. Bot, o grubun
        kimliğini dokunup kopyalayabileceğiniz şekilde cevaplar — mobilde
        aramanıza gerek kalmaz. (Özel sohbette de çalışır.)
      </p>

      <Field
        label="Bot jetonu"
        value={token}
        onChange={setToken}
        placeholder={
          data.tokenSet ? 'Değiştirmek için yeni jetonu yapıştırın' : '123456789:AA…'
        }
        hint="@BotFather'dan alınır. Boş bırakırsanız mevcut jeton korunur; ekranda hiçbir zaman açık gösterilmez."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Bildirim sohbet kimliği (chat id)"
          value={chatId}
          onChange={setChatId}
          placeholder={data.chatIdSource === 'env' ? data.chatId : '-1001234567890'}
          hint="Boş bırakılırsa .env'deki değer kullanılır."
        />
        <Field
          label="Yedek sohbet kimliği (opsiyonel)"
          value={backupChatId}
          onChange={setBackupChatId}
          placeholder="Boşsa bildirim sohbeti kullanılır"
          hint="Yedekleri ayrı bir gruba göndermek isterseniz."
        />
      </div>

      {saveMut.isError && (
        <p className="text-sm text-red-600">
          {(saveMut.error as { response?: { data?: { message?: string } } })
            ?.response?.data?.message ?? 'Kaydedilemedi.'}
        </p>
      )}
      {saveMut.isSuccess && <p className="text-sm text-emerald-600">Kaydedildi.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          Kaydet
        </button>
        <button
          className="btn bg-indigo-600 text-white"
          disabled={reloadMut.isPending}
          title="Ayarları yeniden okur ve jetonu Telegram'a doğrulatır"
          onClick={() => reloadMut.mutate()}
        >
          {reloadMut.isPending ? 'Yeniden başlatılıyor…' : '🔄 Yeniden başlat'}
        </button>
        <button
          className="btn bg-slate-100"
          disabled={testMut.isPending || !data.configured}
          title={
            data.configured
              ? 'Ayarlardaki sohbete deneme mesajı gönderir'
              : 'Önce jeton ve sohbet kimliğini tanımlayın'
          }
          onClick={() => testMut.mutate()}
        >
          {testMut.isPending ? 'Gönderiliyor…' : '✉️ Test mesajı gönder'}
        </button>
        {data.tokenSource === 'db' && (
          <button
            className="btn bg-red-50 text-xs text-red-600"
            disabled={clearTokenMut.isPending}
            title="Arayüzden girilen jetonu siler; varsa .env değerine geri dönülür"
            onClick={() => {
              if (confirm('Arayüzden girilen bot jetonu silinsin mi? Varsa .env değeri devreye girer.')) {
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
          className={`text-sm ${
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
          className={`text-sm ${
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
    </div>
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
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = () => {
    setSaved(false);
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
    setSaved(true);
  };

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold">🔒 Ekran kilidi</h2>
      <p className="text-sm text-slate-500">
        Belirlenen süre boyunca işlem yapılmazsa arayüz otomatik kilitlenir ve
        yalnızca PIN ile açılır. PIN {config.pinLen ? `(${config.pinLen} haneli) ` : ''}
        bu cihazda saklanır (kolaylık amaçlı; gerçek güvenlik katmanı değildir).
        PIN uzunluğu kadar rakam girildiğinde Enter'a gerek kalmadan doğrulanır.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Ekran kilidini etkinleştir
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600">
            Kilitlenme süresi (dakika)
          </span>
          <input
            className="input"
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600">
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
      {saved && <p className="text-sm text-emerald-600">Kaydedildi.</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={save}>
          Kaydet
        </button>
        {ready && (
          <button className="btn bg-slate-100" onClick={lock}>
            🔒 Şimdi kilitle
          </button>
        )}
      </div>
    </div>
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
  const { data: backups } = useQuery({
    queryKey: ['backups'],
    queryFn: fetchBackups,
  });
  const { data: tgState } = useQuery({
    queryKey: ['telegram-backup-state'],
    queryFn: fetchTelegramBackupState,
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

  function handleRestore(key?: string) {
    if (!restoreFile) return;
    if (
      !window.confirm(
        'DİKKAT: Geri yükleme MEVCUT verinin üzerine yazabilir ve geri alınamaz. ' +
          'Devam etmeden önce güncel bir yedek indirmeniz önerilir. Devam edilsin mi?',
      )
    )
      return;
    if (
      !window.confirm(
        `Son onay: "${restoreFile.name}" yedeği veritabanına uygulanacak. Emin misiniz?`,
      )
    )
      return;
    restoreMut.mutate({ file: restoreFile, key });
  }

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold">🗄️ Veritabanı yedekleme</h2>
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
      <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
        <span className="block text-sm font-semibold text-indigo-800">
          🔐 Şifreli yedek · Telegram
        </span>
        <p className="text-xs text-slate-600">
          Sunucu, arka planda saatlik olarak yedeği şifreleyip Telegram'a gönderir
          ve gün içindeki tüm yedekleri <b>tek bir mesajda</b> toplayıp günceller
          (mesaj sohbette sabitlenir). Aşağıdaki düğmeyle elle de gönderebilirsiniz.
        </p>
        <button
          className="btn bg-indigo-600 text-white"
          disabled={sendTelegramMut.isPending}
          onClick={() => sendTelegramMut.mutate()}
        >
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
              Bugünkü Telegram yedekleri ({tgState.dayKey})
            </span>
            <ul className="divide-y rounded-lg border bg-white text-xs">
              {tgState.entries.map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className="flex items-center justify-between px-3 py-1.5"
                >
                  <span>
                    {i + 1}){' '}
                    {new Date(e.at).toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {e.kind === 'manual' ? 'manuel' : 'otomatik'}
                  </span>
                  <span className="text-slate-400">{humanSize(e.size)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DecryptionKeyPanel />
      </div>

      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
        <span className="block text-sm font-semibold text-red-700">
          Geri yükle (tehlikeli)
        </span>
        <p className="text-xs text-slate-600">
          Düz <code>.sql</code> yedeği veya Telegram'dan indirdiğiniz şifreli{' '}
          <code>.enc</code> dosyasını seçin. Şifreli dosyada önce sunucudaki
          geçerli şifre çözme anahtarı denenir; yedek eski bir anahtarla
          şifrelenmişse anahtar sizden istenir.
        </p>
        <input
          ref={fileRef}
          className="block text-sm"
          type="file"
          accept=".sql,.enc"
          onChange={(e) => {
            setRestoreFile(e.target.files?.[0] ?? null);
            setKeyPrompt(false);
            setManualKey('');
            restoreMut.reset();
          }}
        />
        <button
          className="btn bg-red-600 text-white"
          disabled={!restoreFile || restoreMut.isPending}
          onClick={() => handleRestore()}
        >
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
              className="input h-28 w-full font-mono text-[11px]"
              placeholder="-----BEGIN PRIVATE KEY-----&#10;…&#10;-----END PRIVATE KEY-----"
              value={manualKey}
              onChange={(e) => setManualKey(e.target.value)}
            />
            <button
              className="btn bg-red-600 text-white"
              disabled={!manualKey.trim() || restoreMut.isPending}
              onClick={() => handleRestore(manualKey)}
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
      </div>

      {!!backups?.length && (
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-600">
            Sunucudaki otomatik yedekler
          </span>
          <ul className="divide-y rounded-lg border text-sm">
            {backups.map((b) => (
              <li
                key={b.name}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="truncate">{b.name}</span>
                <span className="shrink-0 text-slate-400">
                  {new Date(b.createdAt).toLocaleString('tr-TR')} ·{' '}
                  {humanSize(b.size)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
      <button
        className="text-xs font-medium text-indigo-700 underline"
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
          {isLoading && <p className="text-xs text-slate-400">Yükleniyor…</p>}
          {isError && (
            <p className="text-xs text-red-600">Anahtar alınamadı.</p>
          )}
          {data && (
            <>
              <textarea
                className="input h-40 w-full font-mono text-[11px]"
                readOnly
                value={data.privateKeyPem}
                onFocus={(e) => e.target.select()}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn bg-slate-100 text-xs" onClick={copy}>
                  {copied ? '✓ Kopyalandı' : 'Anahtarı kopyala'}
                </button>
                <span className="text-[11px] text-slate-400">
                  Public parmak izi: {data.publicKeyFingerprint.slice(0, 23)}…
                </span>
              </div>
              <div className="rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                <p className="font-medium">Çözme (bilgisayarda):</p>
                <p>1) Bu anahtarı <code>backup-key.priv.pem</code> olarak kaydedin.</p>
                <p>
                  2) Depodaki betiği çalıştırın:
                  <br />
                  <code>
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

/** #6 Bildirim geçmişi (gönderim defteri) — yedek/borç/stok bildirimleri burada. */
function NotificationsHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications(50),
  });

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-semibold">🔔 Bildirim geçmişi</h2>
      {isLoading && <p className="text-slate-400">Yükleniyor…</p>}
      {!isLoading && !data?.length && (
        <p className="text-sm text-slate-400">Henüz bildirim yok.</p>
      )}
      {!!data?.length && (
        <ul className="divide-y rounded-lg border text-sm">
          {data.map((n) => (
            <li key={n.id} className="space-y-0.5 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{n.subject ?? n.type}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {new Date(n.createdAt).toLocaleString('tr-TR')}
                </span>
              </div>
              <p className="text-slate-600">{n.body}</p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">
                  {n.channel}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 ${
                    n.status === 'sent'
                      ? 'bg-emerald-100 text-emerald-700'
                      : n.status === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-slate-100'
                  }`}
                >
                  {n.status}
                </span>
                {n.error && <span className="text-red-500">{n.error}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

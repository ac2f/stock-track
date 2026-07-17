import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBusinessSettings,
  updateBusinessSettings,
  type UpdateBusinessInput,
} from '../../api/settings.api';
import {
  downloadBackup,
  fetchBackups,
  fetchDecryptionKey,
  fetchTelegramBackupState,
  restoreBackup,
  sendBackupToTelegram,
} from '../../api/backups.api';
import { fetchNotifications } from '../../api/notifications.api';
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
      <BackupSection />
      <NotificationsHistory />
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
  const restoreMut = useMutation({
    mutationFn: (file: File) => restoreBackup(file),
    onSuccess: () => {
      setRestoreFile(null);
      if (fileRef.current) fileRef.current.value = '';
      // Geri yükleme sonrası tüm veri değişebilir → önbelleği tazele.
      qc.invalidateQueries();
    },
  });

  function handleRestore() {
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
    restoreMut.mutate(restoreFile);
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
        <input
          ref={fileRef}
          className="block text-sm"
          type="file"
          accept=".sql"
          onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
        />
        <button
          className="btn bg-red-600 text-white"
          disabled={!restoreFile || restoreMut.isPending}
          onClick={handleRestore}
        >
          {restoreMut.isPending ? 'Geri yükleniyor…' : 'Seçili yedeği geri yükle'}
        </button>
        {restoreMut.isError && (
          <p className="text-sm text-red-700">
            {(restoreMut.error as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Geri yükleme başarısız.'}
          </p>
        )}
        {restoreMut.isSuccess && (
          <p className="text-sm text-emerald-700">Geri yükleme tamamlandı.</p>
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

import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchRegistrationOptions, registerBusiness, type RegisterInput } from '../../api/registration.api';
import { LabelChips } from '../../components/network/LabelChips';
import { LocationPicker } from '../../components/network/LocationPicker';
import { Spinner } from '../../components/ui/Loading';
import { apiErrorMessage } from '../../lib/toast';

const EMPTY: RegisterInput = {
  businessName: '',
  ownerName: '',
  email: '',
  phone: '',
  password: '',
  province: '',
  district: '',
  addressLine: '',
  description: '',
  website: '',
  labelIds: [],
  acceptTerms: false,
};

/**
 * Herkese açık işletme kaydı. İşletme kendi BOŞ sistemiyle başlar: deposu,
 * müşterileri, teklifleri başka işletmelerden tamamen ayrıdır. İş kolları
 * yöneticinin tanımladığı etiketlerden seçilir; il/ilçe listeden seçilir.
 */
export function RegisterPage() {
  const { data: options, isLoading, isError } = useQuery({
    queryKey: ['registration-options'],
    queryFn: fetchRegistrationOptions,
    staleTime: 60_000,
  });
  const [form, setForm] = useState<RegisterInput>(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    document.title = 'İşletme kaydı';
  }, []);

  const mut = useMutation({
    mutationFn: (input: RegisterInput) =>
      registerBusiness({
        ...input,
        addressLine: input.addressLine?.trim() || undefined,
        description: input.description?.trim() || undefined,
        website: input.website?.trim() || undefined,
      }),
    onSuccess: (res) => {
      // Hemen etkinleştiyse oturum anahtarları kaydedildi: uygulamayı baştan aç.
      if (res.status === 'active') window.location.assign('/');
    },
  });

  const set = <K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const ready =
    form.businessName.trim().length >= 2 &&
    form.ownerName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    form.phone.replace(/\D/g, '').length >= 7 &&
    form.password.length >= 8 &&
    !!form.province &&
    !!form.district &&
    form.labelIds.length > 0 &&
    form.acceptTerms;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !mut.isPending) mut.mutate(form);
  };

  if (mut.data?.status === 'pending') {
    return (
      <Shell>
        <div className="card space-y-3 p-6 text-center shadow-lg">
          <div className="text-4xl" aria-hidden>
            ✅
          </div>
          <h1 className="text-xl font-bold">Kaydınız alındı</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{mut.data.message}</p>
          <p className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900/50">
            <b>{mut.data.shop.name}</b>
            <br />
            <span className="text-slate-500">{form.email}</span>
          </p>
          <Link to="/login" className="btn-primary w-full">
            Giriş sayfasına dön
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-bold text-slate-900">İşletmenizi kaydedin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Stok, cari, teklif ve üretim takibi için kendinize ait, boş bir sistem açılır.
          {options && options.trialDays > 0 && ` İlk ${options.trialDays} gün deneme süresidir.`}
        </p>
      </div>

      {isLoading && (
        <p className="card text-center text-sm text-slate-500">
          <Spinner /> Yükleniyor…
        </p>
      )}
      {isError && (
        <p role="alert" className="card text-sm text-red-700">
          Kayıt formu yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.
        </p>
      )}
      {options && !options.open && (
        <p role="alert" className="card text-sm text-amber-800 dark:text-amber-200">
          Yeni işletme kaydı şu an kapalı. Lütfen sistem yöneticisiyle iletişime geçin.
        </p>
      )}

      {options?.open && (
        <form onSubmit={submit} className="card space-y-5 p-5 shadow-lg sm:p-6" noValidate>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">İşletme</legend>
            <label className="block">
              <span className="label">
                İşletme adı <span className="text-red-600">*</span>
              </span>
              <input
                className="input"
                value={form.businessName}
                onChange={(e) => set('businessName', e.target.value)}
                autoComplete="organization"
                autoFocus
                maxLength={120}
              />
            </label>
            <LocationPicker
              province={form.province}
              district={form.district}
              required
              idPrefix="reg"
              onChange={(province, district) => setForm((f) => ({ ...f, province, district }))}
            />
            <label className="block">
              <span className="label">Açık adres (ops.)</span>
              <input
                className="input"
                value={form.addressLine ?? ''}
                onChange={(e) => set('addressLine', e.target.value)}
                autoComplete="street-address"
                maxLength={300}
              />
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">
              İş kolu <span className="text-red-600">*</span>
            </legend>
            <p className="text-xs text-slate-500">
              Diğer işletmelerin sizi bulabilmesi için yaptığınız işleri seçin (en çok 8).
            </p>
            <LabelChips
              labels={options.labels}
              value={form.labelIds}
              max={8}
              onChange={(ids) => set('labelIds', ids)}
            />
            {options.labels.length === 0 && (
              <p className="text-xs text-amber-700">Henüz tanımlı iş kolu yok; yönetici ekleyene kadar kayıt olunamaz.</p>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Yetkili ve giriş bilgileri</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">
                  Ad Soyad <span className="text-red-600">*</span>
                </span>
                <input
                  className="input"
                  value={form.ownerName}
                  onChange={(e) => set('ownerName', e.target.value)}
                  autoComplete="name"
                  maxLength={120}
                />
              </label>
              <label className="block">
                <span className="label">
                  Telefon <span className="text-red-600">*</span>
                </span>
                <input
                  className="input"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  autoComplete="tel"
                  placeholder="05xx xxx xx xx"
                  maxLength={40}
                />
              </label>
              <label className="block">
                <span className="label">
                  E-posta (giriş adı) <span className="text-red-600">*</span>
                </span>
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  autoComplete="username"
                  maxLength={160}
                />
              </label>
              <label className="block">
                <span className="label">
                  Parola (en az 8 karakter) <span className="text-red-600">*</span>
                </span>
                <div className="relative">
                  <input
                    className="input pr-16"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    autoComplete="new-password"
                    maxLength={100}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-xs font-medium text-slate-500 hover:text-slate-800"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Gizle' : 'Göster'}
                  </button>
                </div>
              </label>
            </div>
            <label className="block">
              <span className="label">Web sitesi (ops.)</span>
              <input
                className="input"
                inputMode="url"
                autoCapitalize="none"
                value={form.website ?? ''}
                onChange={(e) => set('website', e.target.value)}
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="label">Kısa tanıtım (ops.) — rehberde görünür</span>
              <textarea
                className="input min-h-[72px] py-2"
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
                maxLength={1000}
              />
            </label>
          </fieldset>

          <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900/50">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0"
              checked={form.acceptTerms}
              onChange={(e) => set('acceptTerms', e.target.checked)}
            />
            <span>
              İşletme bilgilerimin (ad, il/ilçe, iletişim, iş kolu, makineler) diğer kayıtlı işletmelerin
              rehberinde görünmesini ve aynı telefonla kayıtlı müşteriler için işletmeler arası bilgi/borç
              uyarısı ağına katılmayı (tutar paylaşılmaz; Ayarlar'dan kapatılabilir) kabul ediyorum.
            </span>
          </label>

          {mut.isError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              ⚠ {apiErrorMessage(mut.error, 'Kayıt tamamlanamadı. Lütfen tekrar deneyin.')}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={!ready || mut.isPending}>
            {mut.isPending ? (
              <>
                <Spinner /> Kaydediliyor…
              </>
            ) : (
              'Kaydı tamamla'
            )}
          </button>
          {!ready && !mut.isPending && (
            <p className="text-center text-xs text-slate-500">
              Zorunlu alanları (*), iş kolunu ve onay kutusunu doldurun.
            </p>
          )}
        </form>
      )}

      <p className="mt-4 text-center text-sm text-slate-600">
        Zaten hesabınız var mı?{' '}
        <Link to="/login" className="font-medium text-blue-700 hover:underline">
          Giriş yapın
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-start justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-100/60 px-4 py-8 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/60 sm:items-center">
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}

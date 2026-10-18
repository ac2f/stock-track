import { FormEvent, KeyboardEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getBrand } from '../../lib/brand';
import { Spinner } from '../../components/ui/Loading';

/** Parola göster/gizle simgeleri (göz / üstü çizili göz). */
function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-7.5 9.75-7.5 9.75 7.5 9.75 7.5-3.75 7.5-9.75 7.5S2.25 12 2.25 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path strokeLinecap="round" d="M4 4l16 16" />}
    </svg>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const brand = getBrand();
  const letter = (brand.trim()[0] ?? 'E').toLocaleUpperCase('tr-TR');
  // Giriş ekranında sekme başlığı da son bilinen işletme adını göstersin.
  useEffect(() => {
    document.title = getBrand();
  }, []);

  // Caps Lock açıkken parola yanlış yazılmasın diye uyar.
  const checkCaps = (e: KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/plates');
    } catch (err) {
      const e = err as { response?: { status?: number } };
      if (!e.response) {
        // Yanıt yok → sunucuya/ağa ulaşılamadı (yanlış parola DEĞİL).
        setError(
          'Sunucuya (API) ulaşılamıyor. Backend çalışıyor mu / adres doğru mu kontrol edin.',
        );
      } else if (e.response.status === 401) {
        setError('E-posta veya parola hatalı.');
      } else {
        setError(`Giriş başarısız (sunucu hatası ${e.response.status}).`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-100/60 px-4 py-10 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/60">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-bold text-white shadow-lg shadow-blue-500/25"
            aria-hidden
          >
            {letter}
          </div>
          <h1 className="mt-4 break-words text-2xl font-bold text-slate-900">{brand}</h1>
          <p className="mt-1 text-sm text-slate-500">Devam etmek için giriş yapın.</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-5 shadow-lg sm:p-6">
          <div>
            <label htmlFor="login-email" className="label">
              E-posta
            </label>
            <input
              id="login-email"
              className="input"
              type="email"
              placeholder="E-posta"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="login-password" className="label">
              Parola
            </label>
            <div className="relative">
              <input
                id="login-password"
                className="input pr-12"
                type={showPassword ? 'text' : 'password'}
                placeholder="Parola"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={checkCaps}
                onKeyUp={checkCaps}
                onBlur={() => setCapsLock(false)}
                aria-describedby={capsLock ? 'login-caps' : undefined}
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
                aria-pressed={showPassword}
                title={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
            {capsLock && (
              <p
                id="login-caps"
                role="status"
                className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300"
              >
                ⇪ Caps Lock açık — büyük harfle yazıyor olabilirsiniz.
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <span aria-hidden>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Giriş yapılıyor…
              </>
            ) : (
              'Giriş Yap'
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Hesabınız yoksa işletme yöneticinizden davet isteyin.
        </p>
      </div>
    </div>
  );
}

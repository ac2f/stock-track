import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getBrand } from '../../lib/brand';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Giriş ekranında sekme başlığı da son bilinen işletme adını göstersin.
  useEffect(() => {
    document.title = getBrand();
  }, []);

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
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold">{getBrand()}</h1>
        <p className="text-sm text-slate-500">Devam etmek için giriş yapın.</p>

        <input
          className="input"
          type="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Parola"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}

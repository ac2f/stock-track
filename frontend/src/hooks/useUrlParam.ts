import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Hızlı aramadan gelen bağlantılar için: adres çubuğundaki ?key=değer bir kez
 * okunur, iş görülür ve parametre adresten silinir (yenilemede tekrar etmez).
 *
 *   useUrlParam('new', () => setShowForm(true));
 *   useUrlParam('customer', (id) => setCustomerId(id));
 *
 * Aynı sayfada birden çok anahtar kullanılabilir: silme işlemi her seferinde
 * adresin o anki halinden yapılır, birbirini ezmez.
 */
export function useUrlParam(key: string, onValue: (value: string) => void): void {
  const location = useLocation();
  const navigate = useNavigate();
  const value = new URLSearchParams(location.search).get(key);
  const cb = useRef(onValue);
  cb.current = onValue;
  useEffect(() => {
    if (value == null) return;
    cb.current(value);
    const next = new URLSearchParams(window.location.search);
    next.delete(key);
    const search = next.toString();
    navigate({ pathname: window.location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  }, [key, value, navigate]);
}

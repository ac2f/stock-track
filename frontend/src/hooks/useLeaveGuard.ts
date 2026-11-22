import { useEffect, useRef, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmDialog } from '../components/ConfirmDialog';

/**
 * Kaydedilmemiş değişiklik koruması: ``ref``'teki formda bir şey yazılınca / seçilince form "değişti" sayılır;
 * o andan form kapanana kadar (kaydedilince ya da vazgeçilince bileşen gider, koruma da gider):
 *
 * - sayfa yenilenir, sekme kapanır ya da başka bir adrese gidilirse tarayıcı sorar;
 * - uygulama içindeki bir bağlantıya (menü, hızlı geçiş) tıklanırsa "Çıkılsın mı?" diye sorulur.
 *
 *   const rootRef = useRef<HTMLDivElement>(null);
 *   useLeaveGuard(rootRef);
 *   return <div ref={rootRef}>…</div>;
 *
 * Formun durumunu bilmesi gerekmez: içindeki alanların ``input`` / ``change`` olaylarına bakar.
 */
export function useLeaveGuard(ref: RefObject<HTMLElement>): void {
  const dirty = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      dirty.current = true;
    };
    el.addEventListener('input', mark);
    el.addEventListener('change', mark);

    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    // Uygulama içi bağlantılar: React Router'ın kendi tıklama işleyicisinden önce (yakalama evresinde, belgede).
    const onClick = (e: MouseEvent) => {
      if (!dirty.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || el.contains(a) || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmDialog({
        title: 'Kaydedilmemiş değişiklikler',
        message: 'Formda kaydedilmemiş değişiklikler var. Sayfadan çıkılırsa kaybolur.',
        confirmText: 'Çık',
        cancelText: 'Formda kal',
        danger: true,
      }).then((ok) => {
        if (ok) {
          dirty.current = false;
          navigate(url.pathname + url.search + url.hash);
        }
      });
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('input', mark);
      el.removeEventListener('change', mark);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [ref, navigate]);
}

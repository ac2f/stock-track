import { useEffect, useRef, useState } from 'react';

/**
 * Tarayıcının gri confirm() kutusu yerine okunaklı onay penceresi.
 *
 *   if (await confirmDialog({ message: '"X" silinsin mi?', danger: true, confirmText: 'Sil' })) …
 *
 * Kısa kullanım için düz metin de verilebilir: `await confirmDialog('Emin misiniz?')`.
 * Enter onaylar, Esc vazgeçer; pencere dışına tıklamak vazgeçmektir.
 */
export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** Silme gibi geri alınamaz işlemler: kırmızı düğme. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let show: ((p: Pending) => void) | null = null;

/** Silme/iptal sözcüğü geçen iletiler kendiliğinden "tehlikeli" sayılır. */
const DANGER_WORDS = /silin|sil\b|kaldır|iptal|çıkar|kapat|geri al|sıfırla|geri yükle/i;

export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  const opts: ConfirmOptions = typeof input === 'string' ? { message: input } : input;
  if (!show) return Promise.resolve(window.confirm(opts.message));
  return new Promise((resolve) => show!({ danger: DANGER_WORDS.test(opts.message), ...opts, resolve }));
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<Pending[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);
  const current = queue[0];

  useEffect(() => {
    show = (p) => setQueue((q) => [...q, p]);
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const prev = document.activeElement as HTMLElement | null;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const close = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  if (!current) return null;
  const title = current.title ?? (current.danger ? 'Emin misiniz?' : 'Onay');
  return (
    <div
      className="animate-fade fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center"
      onMouseDown={() => close(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="st-confirm-title"
        className="animate-pop w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
              current.danger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
            }`}
          >
            {current.danger ? '⚠' : '?'}
          </span>
          <div className="min-w-0">
            <h2 id="st-confirm-title" className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{current.message}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary" onClick={() => close(false)}>
            {current.cancelText ?? 'Vazgeç'}
          </button>
          <button
            ref={okRef}
            className={current.danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => close(true)}
          >
            {current.confirmText ?? (current.danger ? 'Evet, devam et' : 'Tamam')}
          </button>
        </div>
      </div>
    </div>
  );
}

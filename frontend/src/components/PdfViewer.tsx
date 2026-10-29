import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDocument, openPdf, saveBlob } from '../api/documents.api';

/**
 * PDF'i sayfanın içinde gösterir; indirme, yazdırma ve yeni sekmede açma aynı
 * pencerededir. PDF bir kez alınır: "İndir" yeniden istek yapmaz, gösterilen
 * belgenin kendisini kaydeder.
 *
 * Alınamazsa neden pencerede yazılır; "Tekrar dene" ve (verildiyse) aynı
 * belgenin yazdırılabilir HTML sürümü önerilir.
 */
interface Props {
  title: string;
  /** PDF ucu (API yolu). */
  path: string;
  /** İndirilen dosyanın adı. */
  filename: string;
  /** PDF alınamazsa önerilecek yazdırılabilir sürümün yolu. */
  fallbackPath?: string;
  onClose: () => void;
}

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; blob: Blob; url: string }
  | { phase: 'error'; message: string };

export function PdfViewer({ title, path, filename, fallbackPath, onClose }: Props) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const ctl = new AbortController();
    let url: string | null = null;
    setState({ phase: 'loading' });
    fetchDocument(path, ctl.signal).then(
      (blob) => {
        url = URL.createObjectURL(blob);
        setState({ phase: 'ready', blob, url });
      },
      (e: unknown) => {
        if (ctl.signal.aborted) return;
        setState({ phase: 'error', message: (e as Error).message });
      },
    );
    return () => {
      ctl.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, attempt]);

  // Esc kapatır; arkadaki sayfa kaymaz.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const ready = state.phase === 'ready' ? state : null;

  const print = useCallback(() => {
    if (!ready) return;
    try {
      const w = frame.current?.contentWindow;
      if (!w) throw new Error('no frame');
      w.focus();
      w.print();
    } catch {
      // Gömülü görüntüleyici yazdırmaya izin vermiyorsa (bazı tarayıcılar).
      window.open(ready.url, '_blank');
    }
  }, [ready]);

  return (
    <div
      className="animate-fade fixed inset-0 z-[80] flex flex-col bg-slate-900/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
          <button
            className="btn-primary btn-sm"
            disabled={!ready}
            onClick={() => ready && saveBlob(ready.blob, filename)}
            title="PDF dosyasını indir"
          >
            ⬇ İndir
          </button>
          <button
            className="btn-secondary btn-sm"
            disabled={!ready}
            onClick={print}
            title="Yazdır"
          >
            🖨 Yazdır
          </button>
          <button
            className="btn-secondary btn-sm"
            disabled={!ready}
            onClick={() => ready && window.open(ready.url, '_blank')}
            title="PDF'i yeni sekmede aç"
          >
            ↗ Yeni sekme
          </button>
          <button className="btn-secondary btn-sm" onClick={onClose} title="Kapat (Esc)">
            ✕ Kapat
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-slate-100 dark:bg-slate-900">
          {state.phase === 'loading' && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              PDF hazırlanıyor…
            </div>
          )}

          {state.phase === 'error' && (
            <div className="flex h-full items-center justify-center p-4">
              <div
                role="alert"
                className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                <p className="font-semibold">PDF açılamadı</p>
                <p className="mt-1 break-words">{state.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary btn-sm" onClick={() => setAttempt((n) => n + 1)}>
                    ↻ Tekrar dene
                  </button>
                  {fallbackPath && (
                    <button className="btn-secondary btn-sm" onClick={() => openPdf(fallbackPath)}>
                      Yazdırılabilir sayfa olarak aç
                    </button>
                  )}
                </div>
                {fallbackPath && (
                  <p className="mt-2 text-xs text-red-700/80 dark:text-red-300/80">
                    Yazdırılabilir sayfada Ctrl+P ile PDF olarak da kaydedebilirsiniz.
                  </p>
                )}
              </div>
            </div>
          )}

          {ready && (
            <iframe
              ref={frame}
              title={title}
              src={ready.url}
              className="h-full w-full border-0 bg-white"
            />
          )}
        </div>

        {ready && (
          <p className="border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700">
            PDF görünmüyorsa (telefon/tablet tarayıcıları bunu gömülü gösteremeyebilir){' '}
            <b>İndir</b> ya da <b>Yeni sekme</b> düğmesini kullanın.
          </p>
        )}
      </div>
    </div>
  );
}

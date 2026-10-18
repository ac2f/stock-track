/**
 * Küçük bildirim (toast) deposu. Herhangi bir yerden çağrılır:
 *   toast.success('Kaydedildi')   toast.error('Kaydedilemedi: …')
 * <Toaster /> bunları ekranın köşesinde birkaç saniye gösterir.
 */
export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  /** Kısa açıklama satırı (isteğe bağlı). */
  detail?: string;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(items);
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  l(items);
  return () => listeners.delete(l);
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(tone: ToastTone, message: string, detail?: string): number {
  // Aynı bildirim üst üste gelirse (çift tıklama, art arda kayıt) bir kez göster.
  const dup = items.find((t) => t.tone === tone && t.message === message && t.detail === detail);
  if (dup) dismissToast(dup.id);
  const id = ++seq;
  items = [...items.slice(-3), { id, tone, message, detail }];
  emit();
  const ms = tone === 'error' ? 7000 : tone === 'warning' ? 5500 : 3000;
  window.setTimeout(() => dismissToast(id), ms);
  return id;
}

export const toast = {
  success: (message: string, detail?: string) => push('success', message, detail),
  error: (message: string, detail?: string) => push('error', message, detail),
  info: (message: string, detail?: string) => push('info', message, detail),
  warning: (message: string, detail?: string) => push('warning', message, detail),
};

/** Sunucu hatasından okunur ileti (class-validator dizilerini de birleştirir). */
export function apiErrorMessage(error: unknown, fallback = 'İşlem tamamlanamadı.'): string {
  const e = error as { response?: { data?: { message?: unknown } }; message?: string };
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join(' · ');
  if (typeof m === 'string' && m.trim()) return m;
  return fallback;
}

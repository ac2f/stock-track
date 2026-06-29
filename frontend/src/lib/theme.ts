/**
 * Açık/Karanlık tema yönetimi. Seçim localStorage'da tutulur; yoksa işletim
 * sistemi tercihine (prefers-color-scheme) düşülür. `dark` sınıfı <html>'e
 * eklenir (Tailwind darkMode: 'class').
 */
export type Theme = 'light' | 'dark';

const KEY = 'st_theme';

export function getStoredTheme(): Theme | null {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

export function resolveInitialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(KEY, theme);
}

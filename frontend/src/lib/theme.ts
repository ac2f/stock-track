/**
 * Açık/Karanlık tema yönetimi. Seçim localStorage'da tutulur; yoksa işletim
 * sistemi tercihine (prefers-color-scheme) düşülür. `dark` sınıfı <html>'e
 * eklenir (Tailwind darkMode: 'class').
 */
export type Theme = 'light' | 'dark';

const KEY = 'st_theme';

export function getStoredTheme(): Theme | null {
  let v: string | null = null;
  try {
    v = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  return v === 'light' || v === 'dark' ? v : null;
}

export function resolveInitialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Adres çubuğu / sistem çubuğu rengi: sayfanın zemini (public/theme-init.js ile aynı). */
export const THEME_COLORS: Record<Theme, string> = { light: '#f8fafc', dark: '#0f172a' };

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  // Tarayıcının kendi kontrolleri (kaydırma çubuğu, tarih seçici, açılır liste) de temanın renginde.
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* gizli pencere: seçim yalnız bu oturumda */
  }
}

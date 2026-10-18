/**
 * Yazı boyutu tercihi (Normal / Büyük / Çok büyük). Seçim localStorage'da
 * tutulur; <html data-font="..."> üzerinden bütün ekran orantılı büyür.
 */
export type FontScale = 'normal' | 'large' | 'xlarge';

const KEY = 'st_font';

export const FONT_SCALES: { value: FontScale; label: string; title: string }[] = [
  { value: 'normal', label: 'A', title: 'Normal yazı' },
  { value: 'large', label: 'A+', title: 'Büyük yazı' },
  { value: 'xlarge', label: 'A++', title: 'Çok büyük yazı' },
];

export function getFontScale(): FontScale {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'large' || v === 'xlarge' ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyFontScale(scale: FontScale): void {
  const root = document.documentElement;
  if (scale === 'normal') delete root.dataset.font;
  else root.dataset.font = scale;
  try {
    localStorage.setItem(KEY, scale);
  } catch {
    /* depolama kapalı */
  }
}

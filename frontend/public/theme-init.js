/*
 * Tema, sayfa ilk boyanmadan uygulanır: koyu temada açılışta beyaz parlama olmaz, tarayıcının kendi
 * kontrolleri (kaydırma çubuğu, tarih seçici, açılır liste) ve adres çubuğu da temanın rengini alır.
 * Satır içi değil ayrı dosya: güvenlik başlığı (CSP script-src 'self') satır içi betiğe izin vermez.
 * src/lib/theme.ts ile aynı anahtar ve renkler.
 */
(function () {
  var t = null;
  try {
    t = localStorage.getItem('st_theme');
  } catch (e) {
    /* gizli pencere: işletim sistemi tercihi */
  }
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  root.style.colorScheme = t;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0f172a' : '#f8fafc');
})();

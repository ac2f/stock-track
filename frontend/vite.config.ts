import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Derlemedeki bütün dosyaların listesi (dist/asset-manifest.json). Service
 * worker (public/sw.js) çevrimdışı kullanım için bunları önceden saklar:
 * tembel yüklenen ekran parçaları index.html'de geçmediğinden ancak bu
 * listeden bilinir.
 */
function assetManifest(): Plugin {
  return {
    name: 'st-asset-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && !f.endsWith('.map'))
        .map((f) => `/${f}`)
        .sort();
      this.emitFile({
        type: 'asset',
        fileName: 'asset-manifest.json',
        source: JSON.stringify({ files }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), assetManifest()],
  build: {
    rollupOptions: {
      output: {
        // Kütüphaneler (React, router, react-query, axios) ayrı parça: uygulama
        // her güncellendiğinde yeniden indirilmez, tarayıcı önbelleğinde kalır.
        manualChunks(id) {
          if (id.includes('/node_modules/')) return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true, // mobil cihazdan LAN üzerinden test için
  },
  // Üretim derlemesini yerelde denemek için (npm run preview): /api istekleri
  // nginx'teki gibi backend'e gider; service worker localhost'ta çalışır.
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        // PREVIEW_API: arayüzü başka bir sunucuyla denemek için (ör. yerel sunucu :3001).
        target: process.env.PREVIEW_API || 'http://localhost:3000',
        // API kapalıyken nginx gibi 502 dön (arayüz bunu "çevrimdışı" sayar).
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            const r = res as import('http').ServerResponse;
            if (!r.headersSent) r.writeHead(502);
            r.end();
          });
        },
      },
    },
  },
});

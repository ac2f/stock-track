import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
        target: 'http://localhost:3000',
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

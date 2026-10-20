import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { DensityProvider } from './context/DensityContext';
import { applyTheme, resolveInitialTheme } from './lib/theme';
import { applyFontScale, getFontScale } from './lib/fontScale';
import { Toaster } from './components/Toaster';
import { ConfirmHost } from './components/ConfirmDialog';
import { startSync } from './offline/sync';
import './styles/index.css';

// Tema ve yazı boyutunu render'dan önce uygula (flash önlemek için).
applyTheme(resolveInitialTheme());
applyFontScale(getFontScale());

// İş verisi (teklif, stok, ödeme, önizleme...) her ekran açılışında tazelenir:
// genel bir staleTime, geçersiz kılınmayı unutan her işlemden sonra eski veriyi
// "taze" gösterirdi. Seyrek değişen başvuru verileri hooks/useReferenceData
// ile 5 dk taze sayılır.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Çevrimdışı mod: kuyruğu bağlantı gelince gönderir, sağlığı izler.
startSync(queryClient);

// Uygulama kabuğu (sayfa/JS/CSS) tarayıcıda saklanır: sunucu kapalıyken de
// açılır. Yalnız üretim derlemesinde ve HTTPS/localhost'ta çalışır.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <DensityProvider>
            <App />
            <Toaster />
            <ConfirmHost />
          </DensityProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

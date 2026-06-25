# StockTrack ERP — Frontend (Mobile-First)

React + TypeScript + Vite ile geliştirilmiş, **mobil öncelikli** ve masaüstünde
**responsive** çalışan tek sayfa uygulaması (SPA / PWA'ya hazır).

## Tasarım İlkesi: Mobile-First

Tüm bileşenler önce küçük ekran (telefon) için yazılır; `md:` / `lg:` kırılma
noktalarıyla masaüstüne genişletilir. Örnek navigasyon davranışı:

- **Mobil**: Alt sabit gezinme çubuğu (bottom navigation), tek sütun listeler,
  dokunmaya uygun (min 44px) hedefler, kaydırmalı filtre çubuğu.
- **Masaüstü**: Sol yan menü (sidebar), çok sütunlu tablolar, hover etkileşimleri.

Bu davranış `src/layouts/ResponsiveLayout.tsx` içinde tek yerden yönetilir.

## Klasör Yapısı

```
frontend/src/
├── main.tsx                  # Giriş; Router + React Query + AuthProvider
├── App.tsx                   # Rota tanımları (RBAC korumalı)
├── api/
│   ├── client.ts             # Tek axios örneği; token interceptor + 401 yenileme
│   ├── auth.api.ts
│   ├── materials.api.ts      # Plaka listesi/filtre + fiyat karşılaştırma
│   └── customers.api.ts      # Cari + ödeme
├── context/
│   └── AuthContext.tsx       # Oturum + rol durumu (stateless: token localStorage)
├── components/
│   └── RoleGate.tsx          # RBAC: role göre UI gösterimi
├── layouts/
│   └── ResponsiveLayout.tsx  # Mobil alt nav / masaüstü sidebar
├── features/
│   ├── auth/LoginPage.tsx
│   ├── materials/PlatesListPage.tsx   # Gelişmiş filtre + arama
│   └── customers/CustomersListPage.tsx# Borç durumuna göre filtre
├── types/
│   └── index.ts              # Backend ile paylaşılan tipler (DTO ayna)
└── styles/
    └── index.css             # Tailwind katmanları
```

## Çalıştırma

```bash
npm install
cp .env.example .env     # VITE_API_URL'i backend'e göre ayarlayın
npm run dev              # http://localhost:5173
```

## Öne Çıkan UX Özellikleri

| Özellik | Nerede |
| ------- | ------ |
| Rol Tabanlı UI (Sahip/Çalışan) | `components/RoleGate.tsx`, `App.tsx` |
| Gelişmiş filtre & arama (tür/marka/renk/stok) | `features/materials/PlatesListPage.tsx` |
| Borç durumuna göre müşteri filtreleme | `features/customers/CustomersListPage.tsx` |
| Tedarikçi fiyat karşılaştırması | `api/materials.api.ts` → `comparePrices` |
| Otomatik token yenileme (401) | `api/client.ts` |
| Mobil alt nav / masaüstü sidebar | `layouts/ResponsiveLayout.tsx` |

> Not: Bu dizin, mimariyi ve mobil öncelikli yaklaşımı gösteren temsili bir
> iskelettir. Üretim için ek ekranlar aynı `features/*` desenini izleyerek
> eklenir.

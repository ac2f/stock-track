# StockTrack ERP — Stok, Tedarik ve Müşteri Cari Takip Sistemi

Malzeme işleme (reklam / imalat) sektöründe faaliyet gösteren işletmeler için
tasarlanmış; **modüler, ölçeklenebilir ve mobil öncelikli** bir ERP sistemidir.

Plaka bazlı stok yönetimi, tedarikçi fiyat karşılaştırması, metrekare bazlı
üretim/işleme maliyeti hesaplama ve müşteri cari (açık hesap) & ödeme takibini
tek bir çatı altında toplar.

---

## İçindekiler

- [Mimari Özet](#mimari-özet)
- [Teknoloji Yığını](#teknoloji-yığını)
- [Proje Klasör Yapısı](#proje-klasör-yapısı)
- [Çekirdek İş Alanları (Domain)](#çekirdek-iş-alanları-domain)
- [Rol Tabanlı Yetkilendirme (RBAC)](#rol-tabanlı-yetkilendirme-rbac)
- [Kurulum](#kurulum)
- [Cluster & Stateless Mimari](#cluster--stateless-mimari)
- [Dokümantasyon](#dokümantasyon)

---

## Mimari Özet

Sistem iki ana uygulamadan oluşur ve **monorepo** olarak düzenlenmiştir:

```
stock-track/
├── backend/     → NestJS + TypeScript + TypeORM (REST API)
├── frontend/    → React + TypeScript + Vite (Mobile-first PWA)
└── docs/        → Mimari, veritabanı şeması ve API dokümanları
```

Backend, **Clean Architecture / Domain-Driven Design (DDD)** ilkelerine göre
katmanlara ayrılmıştır. Her iş alanı (bounded context) kendi modülü içinde
izole edilmiştir; bağımlılıklar dışarıdan içeriye doğru akar:

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation (Controllers / DTOs / Guards)                  │
│   ──────────────────────────────────────────────────────►   │
│  Application (Services / Use-Cases / Mappers)                │
│   ──────────────────────────────────────────────────────►   │
│  Domain (Entities / Value Objects / Domain Rules / Enums)    │
│   ──────────────────────────────────────────────────────►   │
│  Infrastructure (TypeORM Repositories / Config / External)   │
└─────────────────────────────────────────────────────────────┘
```

Bütün davranış **stateless**'tir: oturum durumu sunucu belleğinde tutulmaz,
JWT ile taşınır. Bu sayede sistem PM2 cluster modunda veya birden çok Docker
replikasında yatayda sorunsuz ölçeklenir.

## Teknoloji Yığını

| Katman        | Teknoloji                                                        |
| ------------- | ---------------------------------------------------------------- |
| Dil           | **TypeScript** (backend & frontend)                              |
| Backend       | **NestJS** 10, TypeORM, PostgreSQL, Passport-JWT, class-validator|
| Frontend      | **React** 18, Vite, React Query, React Router, Tailwind CSS      |
| Kimlik Doğr.  | JWT (access + refresh), RBAC                                     |
| Konfigürasyon | `@nestjs/config` + `.env` + şema doğrulaması (Joi)               |
| Çalıştırma    | PM2 (cluster) / Docker / docker-compose                          |
| Test          | Jest (unit + e2e)                                                |

## Proje Klasör Yapısı

Tam ağaç için [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) dosyasına bakın.
Özet:

```
backend/src/
├── main.ts                     # Uygulama giriş noktası (bootstrap)
├── app.module.ts               # Kök modül
├── config/                     # .env yükleme, doğrulama, TypeORM ayarları
├── common/                     # Paylaşılan altyapı (cross-cutting concerns)
│   ├── decorators/             # @Roles, @CurrentUser, @Public
│   ├── dto/                    # PaginationDto, ortak yanıt yapıları
│   ├── entities/               # BaseEntity (id, timestamps, soft-delete)
│   ├── enums/                  # UserRole, PaymentMethod, MaterialCategory ...
│   ├── filters/                # Global exception filter
│   ├── guards/                 # JwtAuthGuard, RolesGuard
│   └── interceptors/           # Yanıt sarmalama, loglama
└── modules/                    # Bağımsız iş modülleri (bounded contexts)
    ├── auth/                   # Giriş, token üretimi, RBAC
    ├── users/                  # Personel yönetimi
    ├── suppliers/              # Tedarikçiler
    ├── vehicles/               # Araç bilgileri (satın almada kullanılan)
    ├── bank-accounts/          # Banka hesapları (havale/EFT için)
    ├── materials/              # Malzeme şablonları + plakalar + piyasa fiyatları
    ├── purchases/              # Satın alma (personel + araç + tedarikçi)
    ├── processing/             # İşleme kayıtları + m² maliyet hesabı
    └── customers/              # Müşteri cari hesabı + ödeme takibi
```

## Çekirdek İş Alanları (Domain)

| Modül          | Sorumluluk                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------- |
| **materials**  | Malzeme **şablonları** (alüminyum, kompozit, pleksi, dekota, mdf) ile tekrar yazımı önler; plaka bazlı stok (en/boy/kalınlık/marka/renk/kod/özel nitelik) tutar; tedarikçilere göre **piyasa fiyat karşılaştırması** ve son güncelleme zamanını izler. |
| **purchases**  | Alışverişi yapan **personel**, kullanılan **araç** ve **tedarikçi** ile satın alma kaydı; stok girişi. |
| **processing** | Ürünün **ne zaman işlendiğini** zaman damgasıyla tutar; maliyeti **metrekare bazında** hesaplar. Birim m² fiyatı sabit şablondan gelir veya işlem anında **dinamik** değiştirilir. |
| **customers**  | Açık hesap **borcunu anlık** hesaplar; ödemenin tarihi/miktarı ve **ödeme sonrası kalan borç** dinamik güncellenir, geçmişe dönük izlenir. Nakitte **parayı teslim alan çalışan**, havalede **hedef banka hesabı** zorunludur. |

Ayrıntılı veri modeli için [`docs/DATABASE.md`](docs/DATABASE.md).

## Rol Tabanlı Yetkilendirme (RBAC)

| Rol                          | Yetkiler                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| **OWNER** (İşletme Sahibi)   | Tüm yetkiler + mali raporlar, fiyat şablonları, kullanıcı yönetimi.      |
| **EMPLOYEE** (Çalışan)       | Stok girişi, işleme kaydı, nakit tahsilat. Mali raporlara erişemez.      |

Yetkilendirme `@Roles(...)` dekoratörü + `RolesGuard` ile bildirimsel olarak
uygulanır. Örnek için `modules/customers/customers.controller.ts`.

## Kurulum

```bash
# 1) Bağımlılıklar
cd backend && npm install

# 2) Ortam değişkenleri
cp .env.example .env        # değerleri düzenleyin

# 3) Veritabanı (Docker ile)
docker compose up -d postgres

# 4) Geliştirme modunda çalıştır
npm run start:dev

# 5) Üretim (PM2 cluster)
npm run build && pm2 start ecosystem.config.js
```

Frontend için `frontend/README.md` dosyasına bakın.

## Cluster & Stateless Mimari

- **Stateless**: Sunucu hiçbir oturum verisini bellekte tutmaz. Kimlik bilgisi
  her istekte `Authorization: Bearer <jwt>` ile gelir.
- **PM2 cluster**: `ecosystem.config.js` ile `instances: 'max'` çekirdek sayısı
  kadar süreç başlatılır.
- **Docker**: `Dockerfile` ile imaj üretilir, yatay ölçeklemede her replika
  bağımsız çalışır.
- Paylaşılan durum (cache, kuyruk, rate-limit) gerektiğinde Redis'e taşınabilir
  — kod buna göre soyutlanmıştır (bkz. `config/configuration.ts`).

## Dokümantasyon

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Katmanlar, klasör ağacı, ilkeler
- [`docs/DATABASE.md`](docs/DATABASE.md) — Varlık-ilişki (ER) şeması, tüm tablolar
- [`docs/API.md`](docs/API.md) — Uç noktalar (endpoints) ve örnek istek/yanıtlar

# Mimari (Architecture)

StockTrack ERP backend'i **Clean Architecture** ve **Domain-Driven Design (DDD)**
ilkelerine göre tasarlanmıştır. Amaç; iş kurallarını çerçeveden (NestJS),
veritabanından (TypeORM/PostgreSQL) ve dış servislerden bağımsız tutmaktır.

## 1. Katmanlar (Layers)

```
        ┌──────────────────────────────────────────────────────────┐
        │                  PRESENTATION LAYER                       │
        │   Controllers · DTO'lar · Guards · Interceptors · Pipes   │
        │   (HTTP'i bilir, iş kuralı bilmez)                        │
        └───────────────────────────┬──────────────────────────────┘
                                    │ çağırır
        ┌───────────────────────────▼──────────────────────────────┐
        │                  APPLICATION LAYER                        │
        │   Services (Use-Case'ler) · Mappers · Orkestrasyon        │
        │   (İş akışını koordine eder, transaction sınırı çizer)    │
        └───────────────────────────┬──────────────────────────────┘
                                    │ kullanır
        ┌───────────────────────────▼──────────────────────────────┐
        │                     DOMAIN LAYER                          │
        │   Entities · Value Objects · Enums · Domain Servisleri    │
        │   (Saf iş kuralı; hiçbir çerçeveye bağımlı değildir)      │
        └───────────────────────────┬──────────────────────────────┘
                                    │ soyutlama (port)
        ┌───────────────────────────▼──────────────────────────────┐
        │                INFRASTRUCTURE LAYER                       │
        │   TypeORM Repositories · Config · JWT · Dış Entegrasyonlar│
        └──────────────────────────────────────────────────────────┘
```

**Bağımlılık kuralı:** Oklar daima içeriye doğrudur. Domain katmanı dışarıyı
bilmez; Infrastructure, Domain'in tanımladığı arayüzleri (port) uygular.

## 2. Modül Anatomisi

Her iş modülü kendi içinde aynı standardı taşır (örnek: `customers`):

```
modules/customers/
├── customers.module.ts            # Modül tanımı (DI konteyneri)
├── controllers/
│   ├── customers.controller.ts    # /customers uç noktaları
│   └── payments.controller.ts     # /customers/:id/payments
├── services/
│   ├── customers.service.ts       # CRUD + cari sorgu
│   ├── customer-account.service.ts# Domain servisi: borç hesabı (DEBIT/CREDIT)
│   └── payments.service.ts        # Ödeme alma akışı
├── entities/
│   ├── customer.entity.ts
│   ├── customer-ledger-entry.entity.ts
│   └── payment.entity.ts
├── dto/
│   ├── create-customer.dto.ts
│   ├── create-payment.dto.ts
│   └── query-customer.dto.ts
└── enums/  (modüle özel enum'lar; paylaşılanlar common/enums altında)
```

> **İlke:** "Screaming Architecture" — klasör adları çerçeveyi değil, işin
> kendisini (materials, purchases, processing, customers) anlatır.

## 3. Tam Klasör Ağacı

```
stock-track/
├── README.md
├── docker-compose.yml
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   └── API.md
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   ├── .env.example
│   ├── Dockerfile
│   ├── ecosystem.config.js                 # PM2 cluster
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       │
│       ├── config/
│       │   ├── configuration.ts            # Tipli config nesnesi
│       │   ├── env.validation.ts           # Joi ile .env doğrulama
│       │   └── typeorm.config.ts           # DataSource (CLI & runtime)
│       │
│       ├── common/
│       │   ├── decorators/
│       │   │   ├── current-user.decorator.ts
│       │   │   ├── public.decorator.ts
│       │   │   └── roles.decorator.ts
│       │   ├── dto/
│       │   │   ├── pagination.dto.ts
│       │   │   └── paginated-result.ts
│       │   ├── entities/
│       │   │   └── base.entity.ts
│       │   ├── enums/
│       │   │   ├── user-role.enum.ts
│       │   │   ├── material-category.enum.ts
│       │   │   ├── price-unit.enum.ts
│       │   │   ├── payment-method.enum.ts
│       │   │   ├── ledger-entry-type.enum.ts
│       │   │   └── ledger-source-type.enum.ts
│       │   ├── filters/
│       │   │   └── all-exceptions.filter.ts
│       │   ├── guards/
│       │   │   ├── jwt-auth.guard.ts
│       │   │   └── roles.guard.ts
│       │   ├── interceptors/
│       │   │   └── transform.interceptor.ts
│       │   └── utils/
│       │       └── area.util.ts            # mm → m² dönüşümü (saf fonksiyon)
│       │
│       └── modules/
│           ├── auth/
│           ├── users/
│           ├── suppliers/
│           ├── vehicles/
│           ├── bank-accounts/
│           ├── materials/
│           ├── purchases/
│           ├── processing/
│           └── customers/
│
└── frontend/
    ├── package.json
    ├── README.md
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/                 # Eksen: tek bir HTTP istemcisi + servis dosyaları
        ├── components/          # Yeniden kullanılabilir UI (mobile-first)
        ├── features/            # materials, customers, processing ... ekranları
        ├── hooks/
        ├── context/             # AuthContext (RBAC)
        ├── layouts/             # ResponsiveLayout (alt nav mobil / yan menü masaüstü)
        └── styles/
```

## 4. Tasarım İlkeleri

1. **Single Responsibility** — Her servis tek bir use-case ailesinden sorumlu.
   Cari borç hesabı `CustomerAccountService` içinde izole edilmiştir.
2. **Dependency Inversion** — Servisler somut repository yerine TypeORM
   `Repository<T>` soyutlamasını DI ile alır; testte mock'lanabilir.
3. **Open/Closed** — Yeni malzeme türü eklemek tablo değişikliği gerektirmez;
   `MaterialTemplate` + `attributes (jsonb)` ile genişler.
4. **Stateless** — Kimlik JWT ile taşınır, sunucuda oturum tutulmaz → cluster'a
   uygun.
5. **Konfigürasyon dışarıda** — Tüm ortam değerleri `.env` → `configuration.ts`
   üzerinden tipli okunur, koda gömülmez.
6. **Soft-delete & audit** — `BaseEntity` her tabloya `createdAt/updatedAt/
   deletedAt` ekler; veri silinmez, işaretlenir.

## 5. Transaction & Tutarlılık

Para ve stok hareketi içeren akışlar (ödeme alma, satın alma ile stok girişi,
işleme ile maliyet & cari borç) **tek bir veritabanı transaction'ı** içinde
yürütülür (`DataSource.transaction(...)`). Böylece kısmi yazımlar engellenir ve
cari bakiye ile defter (ledger) her zaman tutarlı kalır.

## 6. Genişletme Senaryoları

| İhtiyaç                         | Nasıl eklenir                                              |
| ------------------------------- | --------------------------------------------------------- |
| Yeni malzeme türü               | `MaterialCategory` enum + yeni `MaterialTemplate` kaydı   |
| Yeni ödeme yöntemi (POS/Kredi)  | `PaymentMethod` enum + `Payment` doğrulama kuralı         |
| Raporlama modülü                | `modules/reports/` yeni bounded context                   |
| Çoklu depo                      | `Warehouse` entity + `MaterialPlate.warehouseId`          |
| Mesaj kuyruğu / bildirim        | Infrastructure'a yeni adaptör; domain değişmez            |

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
- [Dükkânlar ve Yetkiler](#dükkânlar-ve-yetkiler)
- [Arayüz ve Kısayollar](#arayüz-ve-kısayollar)
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
    ├── shops/                  # Dükkânlar, ekip, alan bazlı okuma/yazma izinleri
    ├── auth/                   # Giriş, token üretimi
    ├── users/                  # Personel yönetimi
    ├── suppliers/              # Tedarikçiler
    ├── vehicles/               # Araç bilgileri (satın almada kullanılan)
    ├── bank-accounts/          # Banka hesapları (havale/EFT için)
    ├── warehouses/             # Depo/lokasyon tanımları
    ├── currency/               # Döviz kurları + çevrim (manuel + otomatik)
    ├── materials/              # Genel malzeme (tabaka/rulo) + depo/konsinye stok + piyasa fiyatları
    ├── purchases/              # Satın alma (personel + araç + tedarikçi + depo)
    ├── processing/             # İşleme kayıtları + m²/metre/adet maliyet + üretim kuyruğu (makine/durum)
    ├── sales/                  # Satış & konsinye (kendi/üçüncü kişi malzemesi + sahip mahsubu)
    ├── quotes/                 # Teklif (proforma); onayda satış/işlemeye dönüşür
    ├── customers/              # Müşteri cari hesabı + ödeme/tahsilat + portal token
    ├── reports/                # Mali raporlar & dashboard (OWNER)
    ├── documents/              # PDF (fatura/irsaliye/teklif/ekstre) + Excel/CSV dışa aktarım
    ├── portal/                 # Müşteri self-servis portalı (public, token'lı, salt-okunur)
    ├── notifications/          # Bildirim & hatırlatma (Log + Telegram + WhatsApp)
    └── corel/                  # CorelDRAW eklentisi (ac2f pack): anahtarlı, salt-okunur müşteri/stok listesi
```

## Çekirdek İş Alanları (Domain)

| Modül          | Sorumluluk                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------- |
| **materials**  | Malzeme **şablonları** (alüminyum, kompozit, pleksi, dekota, mdf) ile tekrar yazımı önler; plaka bazlı stok (en/boy/kalınlık/marka/renk/kod/özel nitelik) tutar; tedarikçilere göre **piyasa fiyat karşılaştırması** ve son güncelleme zamanını izler. |
| **purchases**  | Alışverişi yapan **personel**, kullanılan **araç** ve **tedarikçi** ile satın alma kaydı; stok girişi. |
| **processing** | Ürünün **ne zaman işlendiğini** zaman damgasıyla tutar; maliyeti **metrekare bazında** hesaplar. Birim m² fiyatı sabit şablondan gelir veya işlem anında **dinamik** değiştirilir. |
| **customers**  | Açık hesap **borcunu anlık** hesaplar; ödemenin tarihi/miktarı ve **ödeme sonrası kalan borç** dinamik güncellenir, geçmişe dönük izlenir. Nakitte **parayı teslim alan çalışan**, havalede **hedef banka hesabı** zorunludur. |

Ayrıntılı veri modeli için [`docs/DATABASE.md`](docs/DATABASE.md).

## Dükkânlar ve Yetkiler

Birden çok dükkân (şube ya da ayrı işletme) tek kurulumda çalışır; her
dükkânın **deposu, müşterileri, teklifleri, ödemeleri, giderleri ve ayarları
birbirinden bağımsızdır**.

| Kim | Ne yapar |
| --- | -------- |
| **Sistem sahibi** (`owner`) | Her dükkânda her şey; dükkân açar/kapatır, herkesin izinlerini düzenler, yedek ve Telegram botu. |
| **Dükkân yöneticisi** | Yönettiği dükkânın ekibini düzenler — yalnız kendisinde olan izinleri verebilir, kendi üyeliğini değiştiremez. Kendi veri erişimi de izin tablosuna bağlıdır. |
| **Kullanıcı** | Üye olduğu her dükkânda, verilen izinlerle. |

İzinler dükkân ve alan başınadır, **okuma ve yazma ayrı** işaretlenir.
Alanlar: stok, katalog/tarifeler, satın alma, iş kuyruğu, teklif, satış,
müşteri, ödeme ve cari, gider, banka ve mutabakat, rapor, dükkân ayarları.

Sunucu tarafında ayrım altyapıdadır: her istek `X-Shop-Id` ile bir dükkân
adına yapılır, global `ShopAccessGuard` üyeliği ve alan iznini denetler,
TypeORM süzgeci her sorguya dükkân koşulunu kendiliğinden ekler (bkz.
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) § 6).

**Çevrimdışı:** sunucuya ulaşılamazken arayüz son verilerle açılır; müşteri,
tahsilat, teklif, satış, iş, gider, satın alma ve stok girişi cihazda sıraya
alınır ve bağlantı gelince bir kez gönderilir (bkz.
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) § 6–8).

## Arayüz ve Kısayollar

- **Hızlı arama (Ctrl+K ya da 🔍):** ekran adı, işlem ("yeni teklif",
  "tahsilat al", "gider gir") ya da müşteri/plaka adı yazın. Müşteride
  Enter cari ekstresini, ⇧ Enter tahsilatı açar.
- **Klavye:** `/` sayfadaki arama kutusu, `N` o sayfada yeni kayıt,
  `Alt+1…9` menüdeki ekranlar, `Esc` pencereyi kapatır, `?` bütün liste.
- **Görünüm** (sol alttaki kullanıcı kartı, telefonda *Menü*): açık/koyu tema,
  yazı boyutu (A / A+ / A++), detaylı ya da sıkı liste, gruplu ya da düz liste.
  Seçimler o cihazda hatırlanır. Yan menü « ile daraltılabilir.
- **Telefonda** altta dört ana ekran ve *Menü*; filtreler "Filtreler"
  düğmesinin arkasında durur, arama kutusu her zaman görünür.
- Her kayıt, güncelleme ve silme sonucu köşede kısa bir bildirimle söylenir;
  silme gibi işlemler okunaklı bir onay penceresi ister.
- Tarih filtrelerinde tek dokunuşla *Bugün, Dün, Bu hafta, Bu ay, Geçen ay,
  Son 30 gün, Bu yıl*.

## Kurulum

### ⚡ Tek komutla otomatik kurulum (önerilen)

Tek ön koşul: **Docker** (Windows'ta Docker Desktop) kurulu ve çalışır olması.
Script; `.env` dosyalarını üretir, güçlü secret'ları atar, tüm servisleri
(Postgres + API + Web) derleyip başlatır ve ilk giriş hesabını otomatik oluşturur.

**Windows:** `install.bat` dosyasına çift tıklayın.

**Linux / macOS:**

```bash
./install.sh
```

Bitince ekrana arayüz adresi (`http://<ip>/`) ve giriş bilgileri yazılır.
Güncellemek için: `git pull && ./install.sh` (Windows'ta tekrar `install.bat`).
Ayrıntılı dağıtım/üretim notları: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### Manuel (geliştirme) kurulum

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

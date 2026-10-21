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
- [Dükkânlar arası satış](#dükkânlar-arası-satış)
- [Arayüz ve Kısayollar](#arayüz-ve-kısayollar)
- [Fiyatlar ve fiyat çatıları](#fiyatlar-ve-fiyat-çatıları)
- [Otomatik klasörler (runner)](#otomatik-klasörler-runner)
- [Performans](#performans)
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

## Dükkânlar arası satış

Bir dükkân stoğundaki malzemeyi başka bir dükkâna satabilir (menü:
**🔁 Dükkânlar Arası**, stok kartında **🔁 Dükkâna sat**, hızlı aramada
"başka dükkâna malzeme sat"). Tek kayıtta iki taraf birden işlenir:

| Satan dükkân | Alan dükkân |
| ------------ | ----------- |
| Alan dükkân adına açılan cariye **satış**: stok düşer (tabakadan parça satılabilir: en × boy), tutar o carinin borcuna yazılır. Ödeme gelince **Tahsilat**'tan girilir. | Satan dükkân adına açılan tedarikçiden **alış**: her kalem yeni stok kalemi olarak girer (tabakada her parça ayrı), alış fiyatı malzemenin **maliyeti** olur; sonraki satışta kâr bunun üzerinden hesaplanır. |

Belge `DA-YYYY-NNNN` numarası alır ve iki kaydı birbirine bağlar.

**Kime satıldı?** Belge, her parçanın alan dükkândaki karşılığını izler. Parça
orada bir müşteriye satılırsa (ya da işlenirse) belgede kalem altında
**müşteri, tarih, satılan ölçü/miktar ve tutar** görünür; kalemin durumu
*Stokta / Kısmen satıldı (kalan %) / Satıldı* olarak güncellenir. Ayrıca:

- alan dükkânın stok kartında **🏬 X dükkânından** rozeti (belgeye bağlantı),
- alan dükkânın satış listesinde kalemde **"X dükkânından alınan"** işareti,
- satan dükkânın satış listesinde **"🔁 Y dükkânına · DA-…"** işareti.

**Yetki:** satan dükkânda *satış yazma*, alan dükkânda *satın alma yazma*
(stok girişi) gerekir; sistem sahibi her iki dükkânda yetkilidir. Belgeler
satan dükkânda *satış*, alan dükkânda *satın alma* okuma iznine göre görünür.
Müşteri adları ve tutarlar, kullanıcı alan dükkânda satışları görebiliyorsa
gösterilir; göremiyorsa yalnız durum ("satıldı") görünür.

**Geri alma:** alan dükkânda hiçbir parça kullanılmadıysa (satılmadı,
işlenmedi, teklife eklenmedi, kesilmedi) satan dükkân belgeyi **Geri al**
ile iptal eder: satış silinir, stok ve cari eski haline döner, alan dükkândaki
alış ve kalemler kaldırılır. Belge "iptal" olarak kalır.

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

## Fiyatlar ve fiyat çatıları

Teklifte stok kaleminin satış fiyatı şuradan önerilir (öncelik sırasıyla):

1. **Kalemin kendi perakende fiyatı** — *Stok › kalem › Düzenle › Perakende
   fiyatı* ya da teklifte *Fiyat ekle*.
2. **Fiyat çatısı** — *Yönetim › Fiyat Çatıları*. Bir grup malzemeye (tüm
   pleksiler, 2.8 mm pleksiler, beyaz pleksiler, Akpolimer 2.8 mm beyaz pleksi
   …) malzemecilerin fiyatlarını girersiniz; biri **çatı fiyatı** seçilir
   (seçilmezse en ucuzu). Fiyat TL ya da dövizle girilebilir, dövizde son kur
   kullanılır. Bir kaleme birden çok çatı uyarsa en özel olanı geçerlidir.

Öneriye kâr yüzdesi eklenir (kaleminki → çatınınki → Ayarlar › Fiyatlandırma).
Kalem başına malzemeci fiyatları (*Stok › kalem › Tedarikçi fiyatları*)
yalnız piyasa karşılaştırması içindir.

**Kâr (satın alınan malzemede):** dükkânın kendi stoğundaki malzeme teklife
satış kalemi olarak eklenince, satış fiyatının altında alış maliyeti ve kâr
(ya da zarar) tutarıyla yüzdesi görünür; teklif kartında da toplam kâr yazar.
Maliyet o kalemin son *Satın Alma* kaydından alınır; kalemin kendi alışı
yoksa (kesilip kalan parça gibi) aynı ürün türünün son alışı kullanılır.
Tabaka başına alış standart tabaka alanına bölünüp m² maliyetine çevrilir;
dövizli alış, alış tarihindeki kurla TL'ye çevrilir. Satın alma kaydı
olmayan malzemede ve müşterinin/konsinye malzemesinde kâr gösterilmez.

**Renkler** ad + kodla tutulur: aynı renkte birden çok kod (Beyaz 1001,
Beyaz 2002) ve markaya özel kodlar olabilir. Ürün türünde renk, ad satırı ve
yanındaki kod çipleriyle seçilir; seçili markanın kodları önce gelir, başka
markanın kodları seçilemez, yeni kod aynı yerden eklenir.

**Ürün türleri** aynı özelliklerle (tür + marka + renk + ebat + kalınlık +
alt tür) ikinci kez açılamaz; eski kopyalar *Ürün Türleri* ekranında tek
dokunuşla birleştirilir. Stok girişinde, teklifin malzeme seçicisinde, ürün
türleri ve stok listesinde tür seçince **marka / kalınlık / ebat / renk
çipleri** çıkar; arama sözcük sırasından bağımsızdır ("beyaz 2,8 akpolimer").

## Otomatik klasörler (runner)

Teklif **işe dönüştürülünce** (oluşturulunca değil) dükkân bilgisayarında
gün › müşteri › takım yolu klasörleri kendiliğinden açılır. Bunu sunucu
değil, dükkân bilgisayarında çalışan **[stock-track-runner](https://github.com/ac2f/stock-track-runner)**
yapar (sunucu uzakta olabilir, bilgisayara yazamaz). Runner dükkânın Corel
anahtarıyla `/corel/jobs` ucunu okur; klasör adları Corel eklentisiyle
aynıdır. Kurulum: runner deposundaki `install.bat`.

**Çalışıyor mu?**
- StockTrack › *Ayarlar › Corel entegrasyonu › Otomatik klasörler*: her
  bilgisayar için bağlı / bağlantı yok, son nabız, gün klasörü, son açılan
  klasör ve varsa sorun.
- *Teklifler* başlığındaki rozet (“Runner bağlı · DUKKAN-PC”) ve her işe dönmüş
  teklifte “📁 Klasörler açıldı: gün › müşteri” ya da neden açılmadığı.
  Runner kapalıyken dönen teklif için **Klasörleri yeniden iste**.
- Dükkân bilgisayarında masaüstündeki **StockTrack Runner Durumu** penceresi.

## Performans

- **Listeler önden çekilmez.** Müşteri seçicileri yazdıkça sunucuda arar
  (en fazla 100 kayıt sınırı artık 101. müşteriyi gizlemez); stok listesinin
  sahip süzgeci `GET /plates/owners` ile yalnız stokta malı olanları getirir.
  Malzeme seçicileri açıkken ve yazma bitince (~300 ms) `search` ile arar.
- **Toplu istekler.** Satış kalemi seçicisindeki fiyat rozetleri tek
  `GET /plates/pricing?ids=` isteğiyle gelir (önceden satır başına bir
  istek); menüdeki kuyruk rozeti yalnız sayıyı (`/processing/queue/count`)
  ister.
- **Sayfa sayfa yükleme.** Her ekran ayrı bir parça olarak, açılınca
  yüklenir (ilk yük ~743 kB'tan ~97 kB'a indi). Çevrimdışı mod için service
  worker derlemedeki bütün parçaları önceden saklar.
- **Hafif liste sorguları.** Teklif, satış ve satın alma listeleri yalnız
  ekranda görünen alanları yükler; teklif düzenlenirken tamamı ayrıca
  istenir.
- **Önbellek.** Tür, şablon, malzemeci, depo, personel, banka hesabı ve
  ayarlar ekranlar arasında paylaşılır ve 5 dk taze sayılır (değiştiren
  işlem anahtarı geçersiz kılar). İş verisi her ekran açılışında tazelenir.
  Çevrimdışı saklama yalnız çevrimdışı ekranların okuduğu yanıtları tutar;
  arama sonuçları tek havuzda birleşir.
- **Sunucu.** Alacak yaşlandırma tek SQL sorgusu; kur dönüşümü 30 sn'lik
  önbellekten (kur yazılınca temizlenir); cari bakiye yeniden hesabı tek
  UPDATE; sık süzülen sütunlarda indeksler; nginx gzip.
- **Güvenlik.** Müşteri portal anahtarı (`portalToken`) artık listelerde ve
  tekliflerde dönmez; yalnız portal araması ve bağlantıyı üreten işlemler
  okur.

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

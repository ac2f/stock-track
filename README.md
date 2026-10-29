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
- [Telegram: dükkân ve konu başına sohbet](#telegram-dükkân-ve-konu-başına-sohbet)
- [Çevrimdışı çalışma: yerel sunucu](#çevrimdışı-çalışma-yerel-sunucu)
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

**Dükkân geçişi:** yan menüde (telefonda *Menü*'de) dükkânlar tek dokunuşla
seçilen düğmelerdir; başlıktaki renkli dükkân rozeti hızlı bir liste açar,
`Alt+Shift+1…9` ve hızlı aramada "dükkân" yazmak da geçirir. Geçince köşede
hangi dükkâna geçildiği yazar, ekranın üstünde dükkânın renginde ince bir
şerit durur. **Tek dükkâna erişimi olan** kullanıcı seçim görmez, yalnız o
dükkânın adını görür (Telegram botunda da: aşağıda).

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

## Çevrimdışı çalışma: yerel sunucu

İki katman vardır:

1. **Tarayıcıda** (her kurulumda): sunucuya ulaşılamazken ekranlar son
   verilerle açılır, müşteri/tahsilat/teklif/satış... cihazda sıraya alınır
   (bkz. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) § 7).
2. **Dükkânda yerel sunucu** (isteğe bağlı): aynı program dükkândaki bir
   bilgisayarda `SYNC_ROLE=replica` ile çalışır ve merkezin kopyasını tutar.
   Arayüz, Corel eklentisi ve runner ona bağlanır; **internet ya da merkez
   sunucu giderse iş durmaz** — satış, stok düşümü, cari, teklif yerelde
   gerçek iş kurallarıyla yapılır. Yanındaki eşitleme ajanı bağlantı gelince
   yerel işlemleri merkeze gönderir (merkez her birini o kişi adına aynı
   kurallarla yeniden işler; aynı kimlik ve teklif numarasıyla, asıl
   tarihinde, bir kez), merkezdeki değişiklikleri yerele indirir.

   - Merkezde **Ayarlar › Yerel sunucular**: her yerel sunucu için anahtar,
     hizmet ettiği dükkânlar, son görülme ve gecikme.
   - Yerel sunucuya bağlı arayüzde üstte **🖥️ Yerel sunucu** şeridi (merkez
     bağlantısı, bekleyen işlem) ve **Eşitleme** ekranı: merkezin reddettiği
     işlem (ör. stok o arada başka yerde satılmış) için *Yeniden dene* /
     *Vazgeç*.
   - Ekip/dükkân yönetimi, yedek, Telegram ve Corel anahtarı, dükkânlar arası
     satış yerelde yapılmaz (merkezde yapılır).
   - Corel eklentisi (iş menüsü 7 → `5=`) ve runner (`fallback_server`) ana
     sunucu cevap vermezse yerel sunucuya geçer.

   Protokol ve kurallar: [`docs/SYNC.md`](docs/SYNC.md). Kurulum:
   `docker-compose.replica.yml`. Eşitleme ajanı ayrı bir programdır; yazılması
   için hazır talimat: [`docs/SYNC_AGENT_MASTER_PROMPT.md`](docs/SYNC_AGENT_MASTER_PROMPT.md).
   Sözleşme testi: `scripts/sync-contract-test.mjs`.

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
- **Satın alma'da malzeme seçici:** stoğu tükenmemiş her kalem, ürün türüne →
  aynı malzemeye göre gruplu, her satırda kalan ebat ve stok. Sunucu en çok
  100 kalem getirir; fazlası varsa listenin altında "İlk 100 / N kalem
  gösteriliyor" yazar — ürün türü seçerek ya da yazarak daraltılır. Son
  tabakası satılan/kesilen kalem stoktan kalktığı için listede yoktur (yeniden
  girmek için *Stok › Yeni stok kalemi*); alım geçmişinde yine adıyla görünür,
  yanında "tükendi" rozeti olur.
- Tabaka stokunda **her kayıt tek bir tabakadır**: "12 adet" alınan ya da
  eklenen malzeme 12 ayrı tabaka olarak girer (her birinin ebadı kesildikçe
  ayrı azalır). Liste "Grupla" ile aynı malzemeyi tek satırda toplar. Aynı son
  tabakayı eşzamanlı satan iki kişiden yalnız biri satabilir; iptalde tabaka
  geri gelir.
- **İstif:** stok listesinde birebir aynı parçalar (aynı malzeme, kalan ebat,
  sahip ve kaynak) tek kartta **×N** olarak görünür; karta dokunmak parçaları
  tek tek açar (düzenleme parça düzeyindedir). Biten parça yığına karışmaz.
- **Arama (stok, ürün türleri, teklif):** yazım hatası, sözcük sırası, büyük/küçük
  harf ve Türkçe karakter fark etmez ("bayaz akpolimr", "plexi"). Sonuç yoksa
  *Bunu mu demek istediniz* önerir; ürün türü kayıtlı değilse aramadan **dolu bir
  "yeni ürün türü" formu** açar (tür/marka/renk/kalınlık/ebat çıkarılır; katalogda
  olmayanlar kaydederken açılır) ve stok ekleme ya da teklif formu kaldığı
  yerden devam eder. *Ürün Türleri*'nde hiç türü olmayan tür çipine (＋) dokunmak
  formu o türle dolu açar.
- Seçilmiş kutular (müşteri, ürün türü, malzeme…) **tümüyle tıklanabilir**;
  sağdaki *Değiştir* yalnız ipucudur.
- **Cari ekstre PDF:** *Müşteriler › ekstre* ekranındaki **📄 PDF** ekstreyi sayfanın
  içinde bir pencerede gösterir; **İndir**, **Yazdır** ve **Yeni sekme** düğmeleri
  aynı pencerededir (indirme, gösterilen PDF'in kendisini kaydeder). CSV yanında ayrı
  düğmedir. Çok sayfalı ekstrede başlık satırı her sayfada tekrarlanır, dönem
  toplamları ve dönem sonu bakiye altta yazar. Seçili dönem (son kapatmadan
  bugüne / tümü / tarih aralığı) PDF'e de uygulanır. PDF alınamazsa pencerede
  **nedeni** yazar (ör. sunucu eski sürümde, yazı tipi dosyası yok), *Tekrar dene*
  ve yazdırılabilir sayfa seçeneği sunulur. Yazı tipi dosyası bulunamazsa PDF yine
  üretilir (Türkçe harfler sadeleşerek) ve sunucu günlüğüne uyarı yazılır.
- Her kayıt, güncelleme ve silme sonucu köşede kısa bir bildirimle söylenir;
  silme gibi işlemler okunaklı bir onay penceresi ister.
- Tarih filtrelerinde tek dokunuşla *Bugün, Dün, Bu hafta, Bu ay, Geçen ay,
  Son 30 gün, Bu yıl*.

## Geriye dönük kayıt

Geçmişte yapılmış işi sonradan girerken (*Teklif › Yeni teklif*):

1. **Teklif tarihi**ni seçin (Bugün / Dün / 1 hafta önce / 1 ay önce ya da
   takvim). Tarih bugünden önceyse form kendiliğinden *geriye dönük* olur:
   **klasör açılmaz** (dükkân bilgisayarı bugüne klasör oluşturmaz) ve "kabul
   et, dönüştür, işlemeleri **tamamlanmış** ekle" seçilir. Tek dokunuşla
   yalnız teklif de kaydedilebilir.
2. Her kalemde **tamamlanma / işlenme tarihi** girilir (boşsa teklif tarihi).
   Satış tarihi, işin tamamlanma günü ve cari ekstre bu tarihleri izler.
   *Tüm kalemlere toplu uygula*da ortak tarih de verilir.
3. Malzeme stokta yoksa kalemde **➕ Yeni malzeme ekle**: ürün türü (yoksa
   aramadan kaydedilir), ebat (örn. 100×200), **geliş tarihi** ve sahiplik
   (müşterinin malı / işletme) girilir; malzeme teklif kaydedilirken geliş
   tarihiyle stoğa girer ve kalemin plakası olur.
4. **Stoksuz satış kalemi**nde ürün türü (marka/renk/kalınlık) seçilip ebat
   yazılır (stoktan düşülmez); **⚙ İşleme olarak da belirt** aynı malzemeyle
   bir işleme kalemi ekler.
5. Klasör sonradan gerekirse teklif kartında **Klasörü teklif gününe aç**
   (klasör bugüne değil işin gerçek gününe açılır).
6. Hatalı tarihler *Kuyruk › Geçmiş işler*de düzeltilir: işleri tek tek ya da
   *Görünenlerin tümünü seç / Grubu seç* ile işaretleyip alttaki çubuktan
   işlenme/tamamlanma tarihini (*Aynı gün tamamlandı* dahil) ya da notu toplu
   değiştirin. Tutar ve stok değişmez.

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

## Telegram: dükkân ve konu başına sohbet

*Ayarlar › Telegram › Hangi bildirim nereye gitsin?* — her dükkân her konuyu
(satışlar, tahsilat, kritik stok, borç hatırlatma, sabah özeti, **Corel ve
klasörler**) kendi bildirim sohbetine, başka bir kanala/gruba gönderebilir ya
da kapatabilir; her satırda deneme düğmesi var. Dükkânlar aynı sohbeti
paylaşabilir: ekran hangi dükkânların aynı sohbete yazdığını gösterir, birden
çok dükkân varken her mesaj dükkân adıyla başlar.

*Corel ve klasörler* konusu: runner bir teklifin klasörlerini açınca (yol,
açılan/istiflenen klasörler, sorunlar), runner sorun bildirince ve düzelince
(aynı bilgisayar için 10 dakikada en çok bir), runner'ın nabzı kesilince ve
geri gelince.

**Bot erişimi:** çalışanın Telegram kimliği *Ekip* ekranında hesabına
yazılırsa bot ona yalnız üye olduğu dükkânları, o dükkândaki izinleriyle
gösterir; sistemin yetkili listesindekiler eskisi gibi bütün dükkânlara girer.

## Otomatik klasörler (runner)

Teklif **işe dönüştürülünce** (oluşturulunca değil) dükkân bilgisayarında
gün › müşteri › takım yolu klasörleri kendiliğinden açılır. Bunu sunucu
değil, dükkân bilgisayarında çalışan **[stock-track-runner](https://github.com/ac2f/stock-track-runner)**
yapar (sunucu uzakta olabilir, bilgisayara yazamaz). Runner dükkânın Corel
anahtarıyla `/corel/jobs` ucunu okur; klasör adları Corel eklentisiyle
aynıdır. Kurulum: runner deposundaki `install.bat`.

**Klasör adları:** takım yolu klasörünün sonunda bir belirteç vardır:
`001-pleksi-1220x2440--2pcs--2800um-akpolimer-dokme-beyaz--F23-10-2026.merkez.pleksi-beyaz`
— F + projenin gün klasörünün tarihi, malzemenin sahibi (müşterinin kendi
malıysa müşteri, dükkânın stoğuysa dükkânın klasör kodu), tür-renk.
**Malzeme satışında** (teklifte kesim kalemi olmayan satış) takım yolu
klasörü açılmaz: `malzeme-F23-10-2026.merkez.pleksi-beyaz` klasörüne satılan
her ölçü bir `m` dosyası olarak konur (`m1220x2440-2800um-akpolimer-dokme-2adet`,
kullanılan parçadaki `u` dosyası gibi).

**Her dükkânın klasör oluşturucusu ayrı:** *Ayarlar › Corel entegrasyonu ›
Bu dükkânın klasör oluşturucusu* — aç/kapat, belirteçteki klasör kodu,
malzeme satışına klasör, bu dükkânın gün klasörü kökü. Bir bilgisayar birden
çok dükkâna klasör açıyorsa runner'ın `config.json`'unda `shops` listesi
yazılır; her dükkân kendi anahtarı, gün klasörü, durumu ve nabzıyla ayrı
çalışır.

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

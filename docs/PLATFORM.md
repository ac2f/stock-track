# Platform: sistemi birden çok işletmeye kiralamak

StockTrack tek bir kurulumdan **birçok bağımsız işletmeye** hizmet verebilir. Her işletme
kendi **boş** sistemiyle (deposu, kataloğu, müşterileri, teklifleri, ödemeleri, ayarları ve
ekibiyle) başlar ve yalnız kendi verisini görür; başka işletmenin verisine hiçbir yoldan
erişemez (dükkân süzgeci her sorguya eklenir, bkz. `common/shop/shop-scope.typeorm.ts`).

Roller:

| Rol | Kim | Ne yapar |
|---|---|---|
| **Sistem sahibi** (`owner`) | Sistemi kiralayan sizsiniz | Platform ekranı (`/platform`): işletmeleri onaylar/askıya alır, kiralama süresini yönetir, iş kolu etiketlerini ve makine türlerini tanımlar |
| **İşletme yöneticisi** | Kayıt olan işletmenin sahibi | Kendi ekibini, izinlerini, profilini, makinelerini yönetir |
| **Çalışan** | İşletmenin üyesi | Yönetici verdiği izinler kadar |

## Kayıt akışı

1. İşletme `/register` sayfasından kaydolur: ad, **il/ilçe** (listeden), telefon, e-posta, parola,
   en az bir **iş kolu etiketi** (siz tanımlarsınız) ve kullanım onayı.
2. Sistem o işletme için **boş bir dükkân** + yönetici hesabı açar (varsayılan depo, tarifeler ve
   örnek malzeme türleriyle; başka işletmeden hiçbir veri kopyalanmaz).
3. **Platform › Kayıt ve sistem** ayarlarına göre:
   - *Onay gerekir* (varsayılan): hesap **"Onay bekliyor"** olur; giriş yapınca durum ekranı görünür,
     siz onaylayana kadar sisteme giremez. Yeni kayıt Telegram'da bildirilir.
   - *Otomatik onay*: hesap hemen etkin olur ve oturum açılır.
   - *Kayıt kapalı*: form çalışmaz; işletme eklemek sizin elinizde.
4. Onayda **deneme süresi** (varsayılan 14 gün) kiralama bitişi olarak yazılır.

Hesap durumları: `pending` (onay bekliyor) · `active` · `suspended` (askıda: giremez, rehberden kalkar).
**Kiralama süresi dolunca** hesap **salt okunur** olur: veriler görülür, yazma isteklerine
"Kiralama süreniz dolmuş" yanıtı döner (veri kaybı yok); süre uzatılınca yazma hemen açılır.
Sistem sahibi hiçbir durumdan etkilenmez.

Kötüye kullanıma karşı: kayıt IP başına saatte 20, e-posta başına saatte 10 deneme; girişte hesap
başına 15 dakikada 50, IP başına 300 deneme (Redis'te sayılır; bkz. [REDIS.md](REDIS.md)).

## Özellik yetkileri: hangi işletme neyi kullanabilir

Bazı hizmetleri **yalnız siz** (sistem sahibi) işletme işletme açıp kapatırsınız. İşletme yöneticisi
bunları kendisi açamaz; kapalı özellik hem arayüzden (menü, ayar bölümü, arama, bildirim konusu, metinler)
hem de API'den kalkar — ilgili uçlar `403 … bu hesapta etkin değil` döner.

| Özellik | Kapalıyken işletme ne görmez / yapamaz | Varsayılan |
|---|---|---|
| **Corel eklentisi ve klasör oluşturucu** (`corel`) | Ayarlar › Corel entegrasyonu, runner durumu/rozeti, otomatik klasörler ve "klasör açılmasın" seçeneği, makine hızı / asgari alan ayarları, "Corel ve klasörler" Telegram konusu; Corel anahtarı (eskiden üretilmiş olsa bile) çalışmaz. **Corel, runner ve CDR Auto Renamer adları hiçbir ekranda geçmez.** | **Kapalı** |
| **Müşteri ve borç ağı** (`network`) | Aynı telefonla başka işletmede kayıtlı müşteri önerisi ve borç uyarısı (hem alma hem verme) | Açık |
| **İşletme rehberi** (`directory`) | Rehber ekranı; işletme rehberde listelenmez | Açık |

Platform › İşletmeler › işletme kartı › **Ayrıntı / not › Açılan özellikler** bölümünden açılır. Listeyi
**iş kolu etiketine** (malzemeci, baskıcı, atölye, montaj …) ve **açık özelliğe** göre süzebilirsiniz.
Sistem sahibi için her özellik her zaman açıktır. Yükseltmede Corel anahtarı üretmiş ya da runner bağlamış
işletmelerin Corel özelliği **açık** yazılır (kesinti olmaz); sonradan kapatırsanız yeniden açılmaz.

## Neler işletmeye gönderilmez (gizlilik)

Sunucu aşağıdakileri işletmeye **hiçbir yanıtta** vermez (arayüzde gizlemek yetmez, alan hiç yoktur):

- **Telegram bot jetonu** (maskeli önizleme dahil), **yedek sohbeti**, **yetkili kullanıcılar** ve `.env`
  sohbet kimliği. Tek bir sistem botu vardır; işletme jeton girmez, botu **kendi grubuna ekler** ve
  grubun kimliğini (grupta `/idx`) kaydeder. Kayıtta bot o grupta mı diye Telegram'dan doğrulanır, kişisel
  sohbetler reddedilir. İşletmenin sohbeti tanımsızsa bildirimleri **sizin sohbetinize düşmez**.
- **Müşteri portalı temel adresi** ve logo yolu: yalnız siz görür ve değiştirirsiniz (portal bağlantıları
  hep sizin belirlediğiniz adresten üretilir).
- Başka işletmelerin adı, sohbet paylaşımı, ekip/kullanıcı bilgisi; sizin işletme için yazdığınız **yönetici notu**;
  platform yöneticisinin adı (personel listesinde).
- Satış/ödeme/iş kayıtlarına gömülü kullanıcı yalnız **id ve ad** olarak gider (e-posta, telefon, rol,
  Telegram kimliği yok). Nakit tahsilatta "teslim alan" yalnız o dükkânın personeli olabilir.
- Ekibe kullanıcı eklerken işletme yöneticisi başka işletmenin hesabını e-postayla ekleyemez; olan ve olmayan
  e-posta aynı yanıtı verir (e-posta taraması yok).

Telegram botundaki sistem yetkili listesindeki kimlikler (sizin güvendikleriniz) bir işletme yöneticisi
tarafından bir hesaba bağlanamaz.

## Fiyatlandırma (tek menü)

Ayarlar › **Fiyatlandırma**: işleme kalemleri **metre, m², süre (saatlik ücret + asgari dakika) ve adet**
ücretleriyle tek ekrandan tanımlanır; teklifte birim seçilince ücret hazır gelir. Malzeme satış kârı ve
konsinye komisyonu da aynı menüdedir. Makine hızları / asgari alan yalnız Corel özelliği açık işletmede görünür.

## İş kolu etiketleri ve makine türleri

- **Etiketler** (Platform › İş kolu etiketleri): "Malzemeci", "Baskıcı", "Atölye", "Montaj", "Sublimasyon",
  "Lazer Kesim", "CNC Router", "Tabela ve Reklam"… Ekleyin, yeniden adlandırın, pasife alın. İşletmeler kayıtta
  ve profillerinde bunlardan (en çok 8) seçer; rehber ve **Platform › İşletmeler** listesi etikete göre süzülür.
- **Makine türleri** (Platform › Makine türleri): **ağaç** — "Lazer › CO2 lazer / Fiber lazer",
  "CNC Router". Envanterde gördüğünüz makinelere göre alt kategori ekleyin. Her türe **standart
  çalışma alanı ebatları** tanımlanır ("Fiber lazer 1300×900 / 1500×3000"): aynı makine türünde
  farklı ebatlar olabilir.
- İşletme makinesini (**İşletme Profili** sayfası) bir türe ve ebada bağlar ya da kendi en/boyunu
  yazar; "rehberde göster" işaretlidir.

## İşletme rehberi (`/directory`)

Etkin her işletmenin her üyesi diğer işletmeleri arayabilir:

- **İşletmeler** sekmesi: ad/iş kolu/açıklama araması, **il → ilçe**, iş kolu çipleri (işletme sayılarıyla),
  makine türü (üst tür seçince alt türler de gelir), **en az şu ebat** (makine ters çevrilerek de sığıyorsa uyar).
- **Makine ara** sekmesi: "1300×900'ü kesebilen fiber lazer kimde?" — uyan makineler, sahibi işletmeyle.
- Kart üzerinde telefon, WhatsApp, e-posta, web sitesi ve adres; aynı ilçe/il önce gelir.
- Yalnız **"Rehberde görünsün"** diyen ve etkin işletmeler listelenir; iletişim bilgisini işletme profilinde
  kendisi belirler. Askıdaki / süresi biten / kapalı işletme listelenmez.
- İl/ilçe listesi resmî 81 il / 973 ilçedir (`/geo`); serbest yazım yoktur, böylece süzgeç ve sayımlar tutarlıdır.

## Müşteri ağı: aynı telefon, başka işletme

Yeni müşteri kaydederken telefon numarası yazılınca (numara **normalleştirilir**: `0532 123 45 67`,
`+90 532 123 45 67`, `5321234567` aynı numaradır):

1. **Bilgi önerisi.** Aynı numara başka bir işletmede kayıtlıysa ad, firma, e-posta, adres ve vergi
   no formda hazır gelir. İşletme bunları **değiştirip farklı bilgilerle kaydedebilir**; "geri al"
   düğmesi vardır. (Bakiye, not, fiyat, portal bağlantısı **asla** paylaşılmaz.)
2. **Borç uyarısı.** Aynı numara başka bir işletmeye borçluysa kırmızı uyarı çıkar:
   *"Bu telefon numarası başka bir işletmede borçlu görünüyor — Demo Lazer Atölyesi · 45 gündür ·
   31-60 gün"*. Gösterilenler: **işletme adı, borcun yaşı** (en eski ödenmemiş borç; ödemeler en eski
   borca uygulanır — yaşlandırma raporuyla aynı yöntem), yaş aralığı ve ödenmemiş kalem sayısı.
   **Tutar hiçbir yanıtta, hiçbir ekranda yoktur** (sunucu göndermez; testle doğrulanır).
3. Kayıtlı müşterinin kartında da aynı uyarı görünür; telefon değişince yeni numaraya göre güncellenir.
4. Aynı telefonla bu işletmede zaten müşteri varsa "zaten kayıtlı" uyarısı çıkar.

**Gizlilik ve izin.** Ağ **karşılıklı** ve **işletme başına isteğe bağlıdır** (İşletme Profili):
*Müşteri bilgi ağı* ve *Borç uyarı ağı* açık olan işletme hem kendi bilgisini paylaşır hem
başkalarınınkini görür; kapatan ikisinden de çıkar. Yeni kayıtlar açık başlar (kayıt formundaki onayla);
**mevcut dükkânlar kapalı başlar** (kendi onayları olmadan paylaşıma girmezler). Sorgular kullanıcı
başına dakikada 40 ile sınırlıdır, telefon maskelenerek günlüğe yazılır, yalnız *Müşteriler: yazma*
izni olan sorgulayabilir ve sonuçlar cihazda saklanmaz.

## Mevcut kurulumu yükseltmek

Platform öncesi sürümü kullanan bir kurulum `docker compose -f docker-compose.prod.yml up -d --build`
ile güncellendiğinde **bütün eski veriler otomatik olarak ilk işletmeye** taşınır; elle migrasyon
yoktur. Açılıştan önce `pre-upgrade-*.sql` tam yedeği alınır (`api_backups` volume'ü), şema yalnız
ekleme yapar, işletme profili eski *Ayarlar*'daki ad/telefon/adresten doldurulur. İlk işletme
`aktif` ve süresizdir; dizinde görünmez ve ağ paylaşımı kapalıdır (il/ilçeyi girip kendiniz
açarsınız). Ayrıntı ve geri dönüş: `docs/DEPLOYMENT.md` › *3b) Eski sürümden yükseltme*.

## Veri modeli (özet)

`shops` (durum, plan, kiralama bitişi, profil, ağ tercihleri) · `business_labels` ·
`shop_labels` · `machine_types` (ağaç) · `machine_type_sizes` · `machines` (tür, ebat, marka/model, adet,
rehberde göster) · `customers.phone_normalized` (eşleşme dizini) · `system_settings` (kayıt kuralları).
Şema, mevcut kurulumlarda açılışta eklenir; mevcut dükkân, durumu `active` ve rehberde görünmez olarak devam eder.

## Sınırlar (bilerek)

- E-posta doğrulaması yoktur (onay yöneticidedir). Parola sıfırlama e-postası yoktur.
- Ödeme/fatura alma yoktur: kiralama süresini siz elle uzatırsınız (Platform › İşletmeler: +30 gün / +1 yıl).
- Rehber ve ağ **uygulama içidir**; işletmeler arası mesajlaşma yoktur (telefon/WhatsApp/e-posta bağlantıları vardır).

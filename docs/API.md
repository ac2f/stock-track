# API Uç Noktaları (Endpoints)

Tüm yanıtlar `TransformInterceptor` ile sarmalanır:

```json
{ "success": true, "data": <payload>, "timestamp": "2026-06-25T10:00:00.000Z" }
```

Kimlik doğrulama: `Authorization: Bearer <accessToken>` (login hariç tüm uçlar).

### Dükkân seçimi ve izinler

Veriler **dükkân başınadır**: stok, müşteri, teklif, ödeme, gider, ayarlar ...
her dükkânın kendisinindir. Her istek bir dükkân adına yapılır:

```
X-Shop-Id: <dükkân id>
```

Başlık yoksa ve kullanıcının tek dükkânı varsa o kullanılır; birden çoksa
`400 Dükkân seçilmedi`. Kullanıcının dükkânları ve izinleri `GET /auth/me`
yanıtındaki `shops` dizisindedir.

Her kullanıcının her dükkânda, her **alan** için ayrı **okuma** ve **yazma**
izni vardır. Bir rotanın alanı aşağıdaki tablodadır; seviye HTTP yönteminden
çıkar (GET → okuma, diğerleri → yazma) — açıkça belirtilen birkaç istisna
dışında (ör. müşteri ekstresi `payments` okuması ister).

| Alan (`module`) | Rotalar |
| --------------- | ------- |
| `stock` | `/plates/*`, depolar (yazma) |
| `catalog` | `/material-*` (yazma), `/processing-rates`, `/machines` (yazma) |
| `purchases` | `/purchases/*`, tedarikçi ve araç (yazma) |
| `processing` | `/processing/*` |
| `quotes` | `/quotes/*`, teklif belgeleri |
| `sales` | `/sales/*`, satış belgesi |
| `customers` | `/customers` (liste, kart, ekleme, düzenleme, portal bağlantısı) |
| `payments` | `/customers/:id/payments/*`, `/payments/*`, cari hareket/ekstre/indirim |
| `expenses` | `/expenses/*`, `/expense-categories/*`, `/projects/*` |
| `banking` | `/bank-reconciliation/*`, banka hesapları (yazma) |
| `reports` | `/reports/*`, rapor belgeleri ve Excel |
| `settings` | `/settings/*` (yazma), `/notifications/*` |

Formlarda seçilen kısa listeler **dükkânın her üyesine** açıktır (alan izni
aranmaz): depolar, banka hesapları, makineler, tarifeler, tedarikçiler,
araçlar, katalog listeleri, `GET /settings/business|display|pricing|cut-pricing`,
`GET /shops/current/staff`.

| Yetki gösterimi | Anlam |
| --------------- | ----- |
| 🔓 Public       | Token gerekmez |
| 👥 Auth         | Giriş yapmış herhangi bir kullanıcı |
| 👔 OWNER        | Sistem sahibi (her dükkânda her şey). Aşağıdaki eski bölümlerde "👔" işaretli iş uçları artık o alanın iznine bağlıdır (tablo yukarıda); yalnız yedek, kullanıcı hesapları, dükkân açma, kur girişi ve Telegram botu sistem sahibinindir. |
| 🧑‍🔧 EMPLOYEE+   | Dükkânda ilgili alan izni olan herkes |

Yetkisiz istek `403` döner; ileti hangi alanda hangi iznin eksik olduğunu söyler.

### Tekrar güvenli yazma istekleri

Yazma isteklerine (POST/PUT/PATCH/DELETE) benzersiz bir anahtar konabilir:

```
Idempotency-Key: 6f1c2a4e-...   (8–100 karakter: harf, rakam, - _)
```

Aynı kullanıcı aynı anahtarla isteği yeniden gönderirse **yeniden işlenmez**;
ilk yanıt aynen döner (`Idempotent-Replay: true` başlığıyla). İlk istek hâlâ
işleniyorsa `409`. Hata veren istek anahtarı tüketmez (düzeltilip aynı
anahtarla yeniden gönderilebilir). Arayüz her yazma isteğine anahtar koyar;
çevrimdışı kuyruk da gönderimlerinde aynı anahtarı kullanır. Kayıtlar
`IDEMPOTENCY_TTL_DAYS` (varsayılan 14) gün sonra her gece silinir.

Veritabanı kısıt ihlali (aynı kodla ikinci depo gibi) `409`, veritabanına
ulaşılamaması `503` döner.

## Auth
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/auth/login` | 🔓 | `{ email, password }` → `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | 🔓 | `{ refreshToken }` → yeni access token |
| GET  | `/auth/me` | 👥 | Profil + `shops: [{ id, name, isActive, status, plan, subscriptionUntil, expired, isAdmin, permissions }]` |
| GET  | `/health` | 🔓 | `200 { status, db: "up", cache, redis }`; veritabanına ulaşılamıyorsa `503` (Redis çökerse 200 kalır) |

Giriş hız sınırlıdır (hesap başına 15 dk'da 50, IP başına 300): aşılırsa `429` + `Retry-After`.
Hesap `pending`/`suspended` ise dükkân uçları `403` döner; kiralaması bitmiş (`expired`) hesapta
yalnız okuma (GET) çalışır, yazma `403 "Kiralama süreniz dolmuş"` döner.

## Platform ve rehber (çok işletmeli kiralama — bkz. [PLATFORM.md](PLATFORM.md))

Herkese açık (🔓):

| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/registration/options` | `{ open, autoApprove, trialDays, labels }` — kayıt formu seçenekleri |
| POST | `/registration` | İşletme kaydı: `{ businessName, ownerName, email, phone, password, province, district, addressLine?, description?, website?, labelIds[], acceptTerms }` → `{ status: pending|active, message, shop, auth? }`. IP başına saatte 20 deneme |
| GET | `/geo/provinces` | 81 il `{ plate, name, region }` |
| GET | `/geo/provinces/:key/districts` | Ilçeler (`key` plaka kodu ya da il adı) |

İşletme üyesi (👥, dükkân seçili):

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/directory/shops` | 👥 | `?q&province&district&labelIds=a,b&machineTypeId&minWidthMm&minHeightMm&page&limit` — rehberdeki işletmeler (etiket, makine, iletişim) |
| GET | `/directory/machines` | 👥 | Aynı süzgeçler; uyan makineler + sahibi işletme |
| GET | `/directory/facets?province=` | 👥 | İl/ilçe/etiket/makine türü sayıları |
| GET | `/directory/machine-types` | 👥 | Makine türü ağacı, ebatlarıyla |
| GET / PATCH | `/business-profile` | settings (okuma: üye; yazma: settings yazma) | İşletme profili: iletişim, il/ilçe, `labelIds`, `directoryVisible`, `shareDebtInfo`, `shareCustomerInfo` |
| CRUD | `/machines` | catalog | Makine: `machineTypeId`, `sizeId`, `workWidthMm/HeightMm`, `brand`, `model`, `quantity`, `isPublic` |
| GET | `/customer-network/lookup?phone=` | customers yazma | `{ phone, own, suggestion, debtWarnings[], network }`. Dakikada 40 sorgu. **Tutar yoktur**: `debtWarnings: [{ shopName, since, ageDays, bucket, openItems }]` |
| GET | `/customer-network/customers/:id` | customers | Kayıtlı müşterinin başka işletmelerdeki borç uyarıları |

Sistem sahibi (👔, dükkân seçimi gerekmez, yalnız merkez sunucu):

| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET / PATCH | `/platform/settings` | `{ registrationOpen, registrationAutoApprove, trialDays }` |
| GET | `/platform/businesses/stats`, `/platform/businesses`, `/platform/businesses/:id` | İşletmeler (`?status&search&province&district&expiring&labelId&feature`); satırda `labelIds[]` ve `features` |
| PATCH | `/platform/businesses/:id` | `{ status, plan, subscriptionUntil, extendDays, adminNote, isActive, directoryVisible, features }` — `features: { corel?, network?, directory? }` (yalnız gönderilenler değişir; bilinmeyen ad 400) |
| POST | `/platform/businesses/:id/approve` | Onayla (deneme süresi yazılır) |
| CRUD | `/platform/labels` | İş kolu etiketleri |
| CRUD | `/platform/machine-types`, `POST /platform/machine-types/:id/sizes`, `PATCH/DELETE /platform/machine-type-sizes/:sizeId` | Makine türü ağacı ve standart ebatlar |
| GET / POST | `/system/cache`, `/system/cache/flush` | Önbellek durumu / temizleme |

## Users (Hesaplar — 👔 sistem sahibi, dükkân seçimi gerekmez)
| Metot | Yol | Yetki |
|-------|-----|-------|
| POST | `/users` | 👔 |
| GET | `/users` | 👔 |
| PATCH | `/users/:id` | 👔 (rol: `owner` = sistem sahibi, `employee` = kullanıcı) |
| DELETE | `/users/:id` | 👔 (dükkân üyelikleri de silinir) |

## Dükkânlar ve ekip

Dükkân seçimi gerektirmez; hangi dükkânın ekibi düzenleniyorsa adreste yazar.
Sistem sahibi her şeyi yapar. **Dükkân yöneticisi** (`isAdmin`) yalnız kendi
dükkânının ekibini düzenler ve: kendi üyeliğini değiştiremez, kendinde
olmayan bir izni veremez, izinleri kendisininkini aşan birine dokunamaz,
başka dükkânda da çalışan birinin hesabını (parola vb.) değiştiremez.

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/shops/mine` | 👥 | Girebildiğim dükkânlar ve izinlerim |
| GET | `/shops/modules` | 👥 | İzin alanları ve adları |
| GET | `/shops/current/staff` | dükkân üyesi | Seçili dükkânın personeli (`X-Shop-Id`) |
| GET | `/shops` | sahip / yönetici | Ekip ekranındaki dükkânlar (+ `memberCount`) |
| POST | `/shops` | 👔 | `{ name, copyFromShopId?, copyCatalog?, copySettings? }` |
| PATCH | `/shops/:id` | 👔 | `{ name?, isActive? }` (son açık dükkân kapatılamaz) |
| GET | `/shops/:id/members` | sahip / yönetici | Üyeler, izinleri, `editable` |
| POST | `/shops/:id/members` | sahip / yönetici | `{ newUser? \| email? \| userId?, isAdmin?, permissions }` |
| PATCH | `/shops/:id/members/:memberId` | sahip / yönetici | `{ isAdmin?, permissions? }` |
| PATCH | `/shops/:id/members/:memberId/account` | sahip / yönetici | `{ fullName?, phone?, password?, isActive? }` |
| DELETE | `/shops/:id/members/:memberId` | sahip / yönetici | Dükkândan çıkarır (hesap kalır) |

`permissions` örneği: `{ "quotes": { "read": true, "write": true }, "reports": { "read": true, "write": false } }`
— bilinmeyen alanlar atılır, yazılmayanlar kapalı sayılır.

Yeni dükkân boş başlar (stok/müşteri/teklif kopyalanmaz); varsayılan depo,
tarifeler ve malzeme türleri kurulur. `copyCatalog` malzeme türü/şablon/
marka/renk/ebat/kalınlık, tarife, makine ve gider türlerini; `copySettings`
fiyat, kesim fiyatlandırması ve işletme bilgilerini (ad ve Corel anahtarı
hariç) kopyalar.

**Geçiş:** ilk açılışta mevcut bütün kayıtlar "ilk dükkân"a (adı işletme
adından) atanır; mevcut çalışanlar oraya stok, satın alma, iş kuyruğu, teklif,
satış, müşteri ve ödemelerde okuma+yazma izniyle eklenir. Sistem sahibi
üyelik istemez.

## Materials — Türler (Kategoriler)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/material-categories` | 👔 | Yeni tür (ad, kod, varsayılan ölçüm tipi) |
| GET | `/material-categories` | 👥 | |
| GET | `/material-categories/:id` | 👥 | |
| PATCH | `/material-categories/:id` | 👔 | |
| DELETE | `/material-categories/:id` | 👔 | Kullanan şablon varsa `409` |

## Materials — Marka/Renk/Ebat/Kalınlık Katalogları
Her biri kategori bazlıdır (`categoryId`) — bir kategoride tanımlı kayıt başka kategoride
kullanılamaz (şablon/plaka oluşturulurken `categoryId` eşleşmesi sunucuda doğrulanır).

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/material-brands` | 👔 | `{ name, categoryId, isActive? }` |
| GET | `/material-brands` | 👥 | `?categoryId=` |
| PATCH | `/material-brands/:id` | 👔 | |
| DELETE | `/material-brands/:id` | 👔 | Kullanan şablon/plaka varsa `409` |
| POST | `/material-colors` | 👔 | `{ name, code?, categoryId, brandId?, isActive? }` — aynı ad farklı kodla (ya da farklı markada) ayrı renktir; aynı ad + kod + marka varsa mevcut kayıt döner |
| GET | `/material-colors` | 👥 | `?categoryId=` — her renk `brandId` taşır (boş = bütün markalar) |
| PATCH | `/material-colors/:id` | 👔 | Başka bir rengin aynısı (ad + kod + marka) olursa `409`; kalemlerdeki ad/kod da güncellenir |
| DELETE | `/material-colors/:id` | 👔 | Kullanan şablon/plaka varsa `409` |
| POST | `/material-sizes` | 👔 | `{ widthMm, heightMm, categoryId, isActive? }` |
| GET | `/material-sizes` | 👥 | `?categoryId=` |
| PATCH | `/material-sizes/:id` | 👔 | |
| DELETE | `/material-sizes/:id` | 👔 | Kullanan şablon/plaka varsa `409` |
| POST | `/material-thicknesses` | 👔 | `{ valueMm, categoryId, isActive? }` |
| GET | `/material-thicknesses` | 👥 | `?categoryId=` |
| PATCH | `/material-thicknesses/:id` | 👔 | |
| DELETE | `/material-thicknesses/:id` | 👔 | Kullanan şablon/plaka varsa `409` |

## Materials — Şablonlar
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/material-templates` | 👔 | Yeni şablon — `{ categoryId, defaultBrandId?, defaultColorId?, defaultSizeId?, defaultThicknessId?, defaultVariant?, ... }`. Her `default*Id`'nin işaret ettiği katalog kaydı şablonun `categoryId`'siyle eşleşmelidir, aksi halde `400`. `defaultVariant` kategori içi alt tür için (örn. Pleksi'de "Dökme"/"Çekme") |
| GET | `/material-templates` | 👥 | `?categoryId=&search=` — yanıt `defaultBrand/defaultColor/defaultSize/defaultThickness` ilişkilerini eager döner |
| PATCH | `/material-templates/:id` | 👔 | |
| POST | `/material-templates/:id/merge` | 👔 | `{ sourceIds[] }` — kopya türleri bu türe birleştirir; stok kalemleri taşınır, kopyalar silinir (aynı kategori) |

**Aynı ürün türü ikinci kez açılmaz** (oluşturma, düzenleme, toplu stok
girişi): aynı kategori + marka + renk + ebat + kalınlık + alt tür zaten varsa
`409`. Ad sayılmaz; hiç özelliği seçilmemiş türlerde ise ayırt edici olan ad
olduğu için aynı ad kopya sayılır. Farklı bir ürünse alt tür (`defaultVariant`)
ile ayrılır. Toplu stok girişinde (`POST /plates/batch`, `templateId`
verilmeden adlarla) aynı özellikli tür varsa o kullanılır.

## Materials — Plakalar (Stok)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/plates` | 🧑‍🔧 | Şablondan plaka üret — `{ templateId, name?, sku?, variant?, widthMm?, heightMm?, ownerCustomerId?, addedAt?, processedAt?, quantityInStock?, warehouseId? }`. Marka/renk/ebat/kalınlık şablonun `default*Id` değerlerinden miras alınır. `name` yalnız elle yazılacaksa verilir (verilmezse ya da türetilmişle aynıysa saklanmaz; yanıttaki `name` kalem alanlarından üretilir). `sku` verilmezse tür koduyla kısa bir kod atanır (`PLEKSI-000042`). `widthMm/heightMm` bu fiziksel parçanın **kalan (kesilmiş) ebadıdır**; verilmezse standart tabaka ebadından alınır, verilirse standart ebadı **aşamaz** (`400`). `sku` boşsa `tür+marka+renk+kalınlık+tabaka ebatı`'ndan otomatik üretilir (gerekirse `-N` ekiyle benzersizleştirilir). `ownerCustomerId` verilirse açılış stoğu o müşterinin **konsinye** stoğu olarak yazılır; `addedAt` verilmezse bugün |
| GET | `/plates` | 👥 | Gelişmiş filtre: `?categoryId=&brand=&color=&colorId=&thicknessMm=&sizeId=&search=&inStock=true&page=&limit=` — `search` sözcüklere bölünür, her sözcük ad/ürün türü adı/stok kodu/renk kodu/marka/renk/alt tür/kalınlık/ebat sayılarından birinde geçmeli (sıra fark etmez; `2,8` = `2.8`, `1220x2440` iki sözcük). `sizeId` kalemin ya da ürün türünün standart tabakası. |
| GET | `/plates/:id` | 👥 | Plaka + güncel piyasa fiyatları |
| PATCH | `/plates/:id` | 🧑‍🔧 | Kalan ebat, tarihler (`addedAt/processedAt`), ad, `sku`, `variant` güncellenir; kalan ebat türün standart tabaka ebadını aşamaz |
| POST | `/plates/:id/transfer-ownership` | 👔 | Sahipliği taraflar arasında serbestçe aktarır (işletme↔müşteri, müşteri↔müşteri) — `{ fromOwnerCustomerId?, toOwnerCustomerId?, warehouseId?, quantity? }`. Boş taraf işletmedir; miktar verilmezse kaynaktaki tümü |
| POST | `/plates/ensure-template` | 🧑‍🔧 | Ürün türü yoksa **açar**, varsa mevcut olanı döner (kopya açmaz): `{ categoryName, brandName?, colorName?, colorCode?, thicknessMm?, sheetWidthMm?, sheetHeightMm?, variant?, measurementType?, templateName? }` → `{ template, created, autoCreated }`. Tür/marka/renk/kalınlık/ebat katalogda yoksa kendiliğinden açılır. Stok ekleme ve teklif formundaki "ürün türünü kaydet ve kullan" bu uçtan geçer |
| POST | `/plates/:id/deplete` | 🧑‍🔧 | "Tamamını sat" / stoktan tamamen çıkar: tüm seviyeleri sıfırlar ve plakayı soft-delete eder (kalan m² 0 olunca düzenlemede otomatik tetiklenir) |

## Expenses — Giderler (👔 yalnızca İşletme Sahibi)
| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET/POST | `/expense-categories` | Gider türleri (kira/elektrik/market/personel/iş-malzeme…); `{ name, isRecurring?, isActive? }` |
| PATCH/DELETE | `/expense-categories/:id` | Tür güncelle/sil (sürekli işaretleme dahil) |
| GET/POST | `/projects` | İş/Proje kayıtları (ör. "Ahmet Tabela"); `{ name, description? }` |
| PATCH/DELETE | `/projects/:id` | İş güncelle/sil |
| GET | `/expenses` | Filtre: `?from=&to=&categoryId=&projectId=&page=&limit=` |
| GET | `/expenses/summary` | Aynı filtrelerle toplam + tür ve iş bazlı kırılım |
| POST | `/expenses` | `{ categoryId, projectId?, amount, currency?, expenseDate?, description? }` |
| PATCH/DELETE | `/expenses/:id` | Gider güncelle/sil |

## Ödemeler (kart yöntemi)
`POST /customers/:customerId/payments` artık `method: card` destekler →
`cardBusinessName` (serbest metin, kartın geçtiği işletme/POS). `cash` → `receivedById`,
`bank_transfer` → `bankAccountId` zorunluluğu korunur.

## Materials — Piyasa Fiyatları
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| PUT | `/plates/:plateId/prices` | 🧑‍🔧 | Tedarikçi fiyatını ekle/güncelle (zaman damgası otomatik) |
| GET | `/plates/:plateId/prices/compare` | 👥 | **Fiyat karşılaştırması** — en ucuzdan pahalıya, son güncelleme ile, baz para birimine çevrilmiş ortalama |

Örnek karşılaştırma yanıtı:
```json
{
  "plateId": "…",
  "cheapest": { "supplier": "Malzemeci A", "price": 1850.00, "updatedAt": "2026-06-20T09:12:00Z" },
  "average": { "amount": 1885.00, "currency": "TRY" },
  "prices": [
    { "supplier": "Malzemeci A", "price": 1850.00, "unit": "per_plate", "updatedAt": "2026-06-20T09:12:00Z" },
    { "supplier": "Malzemeci B", "price": 1920.00, "unit": "per_plate", "updatedAt": "2026-06-18T14:03:00Z" }
  ]
}
```
`average`, tedarikçi fiyatları farklı para birimlerinde girilmişse her satırı baz para birimine
çevirip aritmetik ortalama alır; tanımsız kur içeren satırlar ortalamadan hariç tutulur, hiçbiri
çevrilemezse `null` döner. Yalnızca bilgi amaçlıdır — teklif formunda birim fiyatı otomatik doldurmaz.

## Purchases (Satın Alma)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/purchases` | 🧑‍🔧 | `{ supplierId, vehicleId, items[] }` — personel token'dan alınır; stok artar |
| GET | `/purchases` | 👥 | `?supplierId=&from=&to=` |
| GET | `/purchases/:id` | 👥 | |

Kalem: `{ plateId, quantity, unitPrice, widthMm?, heightMm? }`. Tabakada
alınan parçanın ölçüsü verilirse alış maliyeti (m²) standart tabaka yerine bu
ölçüden hesaplanır (kesilmiş parça alımı).

**Tabaka stoku (AREA): bir kayıt = bir fiziksel tabaka.** Tabaka alımında
`quantity` tam sayı olmalıdır ve her tabaka için ayrı stok kalemi (kendi
stok kodu, kendi alış fiyatı) açılır; kalemin `plateId`'si ilk tabakadır.
`POST /plates/batch` ve `POST /plates` (`quantityInStock` = N) da aynı kuralla
N ayrı tabaka üretir. Tabakadan kesim/satış ebadı düşürür; tabaka bitince kayıt
stoktan kalkar (soft-delete, stok seviyesi de). Tükenmiş tabakadan düşmek
`400 "…bu tabaka stokta kalmadı"` verir — aynı son tabakayı eşzamanlı satan
iki işlemden yalnız biri başarılı olur (satır kilidi). Satış/iş/teklif iptalinde
tabaka ebadı, depo ve sahibiyle (stok seviyesi 1) geri gelir. Adet/metre
malzemede stok seviyesi satırı transaction içinde kilitlenir; fazla satış olmaz.
Eski sürümde `adet > 1` tek kayıt olarak girilmiş tabaka partileri açılışta
otomatik ayrı tabakalara bölünür (`area-lots-migration`).

## Sync (Merkez ↔ yerel sunucu eşitlemesi)
Ayrıntı ve tam biçimler: [`SYNC.md`](SYNC.md).

**Merkezde, yerel sunucu anahtarıyla** (`X-Replica-Token: str_…`, JWT değil):

| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/sync/hello` | Merkez kimliği, protokol, `schemaHash`, güncel `seq` |
| GET | `/sync/schema` | Eşitlenen tablolar (bağımlılık sırası, kapsam, sütunlar) |
| GET | `/sync/snapshot?table=&afterId=&limit=` | İlk yükleme, sayfa sayfa |
| GET | `/sync/changes?since=&limit=` | Değişiklik akışı; 410 `RESNAPSHOT` |
| POST | `/sync/rows` | `{ table, ids }` → güncel satırlar + `missing` |
| POST | `/sync/push` | `{ ops }` → işlem başına `applied/duplicate/rejected/retry/skipped` |

**Merkezde, sistem sahibi:** `GET/POST /sync/replicas`, `PATCH/DELETE /sync/replicas/:id`
(anahtar yalnız oluşturma yanıtında).

**Her iki rolde:**

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/system/info` | 🔓 | `{ role, version, schemaHash, ready, serverTime }` |
| GET | `/system/sync` | 👥 | Yerel sunucuda ajan durumu + giden kutusu sayıları |
| GET | `/system/sync/outbox?state=` | 👥 | Giden kutusu (varsayılan: karar bekleyenler) |
| POST | `/system/sync/outbox/:id/retry` | 👔 / dükkân yöneticisi | Reddedileni yeniden gönder |
| POST | `/system/sync/outbox/:id/discard` | 👔 / dükkân yöneticisi | Vazgeç (yerel etkisi geri alınır) |

Yerel sunucuda (`SYNC_ROLE=replica`) yönetim uçları 409 döner; yazma
istekleri giden kutusuna yazılır. Hata gövdesinde makinelerin okuduğu `code`
alanı olabilir (ör. `RESNAPSHOT`).

## İşletmeler arası ticaret (satış teklifi · onay/ret · yetkiler · "bende var" · pazar yeri)

Hepsi **ticaret** özelliğini ister (`trade`; sistem sahibi işletme başına kapatabilir → `403`). Her işletme
herhangi bir işletmeye satış teklifi gönderebilir (satıcı) ya da onun paylaştığı stoktan alım talebi açabilir
(alıcı). Belge **karşı taraf onaylayana kadar "onay bekliyor"** kalır; bu sürede iki tarafta da stok, satış,
alış ve cari kaydı **yazılmaz**. Onay anında satıcıda satış, alıcıda alış tek transaction'da yazılır.
Seçili dükkân (`X-Shop-Id`) işlemi yapan taraftır.

### Belgeler (`/shop-transfers`)

| Metot | Yol | İzin | Açıklama |
|-------|-----|------|----------|
| GET | `/shop-transfers/targets?q=` | üye | Teklif/talep edilebilecek işletmeler: `[{ id, name, province, district, own, canSell }]` — kendi şubelerim, **rehberde görünenler** ve daha önce ilişkide olduklarım. Rehberde olmayan işletme aranarak bulunamaz; beni engelleyen çıkmaz |
| GET | `/shop-transfers/pending-count` | üye | `{ awaitingMe, waitingOthers }` — menü rozeti |
| POST | `/shop-transfers` | satış yazma | **Satış teklifi** (satıcı olarak). Hız sınırı: kullanıcı başına saatte 40 |
| POST | `/shop-transfers/request` | satın alma yazma | **Alım talebi** (alıcı olarak); kalemler yalnız satıcının bu işletmeye **listelediği** stoktan seçilebilir |
| GET | `/shop-transfers` | satış ya da satın alma okuma | `?direction=out\|in&status=open\|pending\|completed\|rejected\|cancelled&search=&page=&limit=` — `open`: karar/onay bekleyenler + açık geri alma talepleri |
| GET | `/shop-transfers/:id` | (aynı) | Ayrıntı |
| POST | `/shop-transfers/:id/approve` | karşı tarafın ilgili yazma izni | Teklifi onaylar (ya da açık **geri alma talebini** uygular). Gövde: `{ note?, warehouseId? }` |
| POST | `/shop-transfers/:id/reject` | karşı tarafın ilgili yazma izni | Teklifi ya da geri alma talebini reddeder (`{ note? }`) |
| POST | `/shop-transfers/:id/cancel` | ilgili yazma izni | Bekleyen teklifi **geri çeker**; tamamlanmışı iki tarafı da yönetiyorsanız hemen geri alır, aksi hâlde karşı onaylı **geri alma talebi** açar; kendi açtığınız talebi çeker (`{ note? }`) |

`POST /shop-transfers` (satıcı) gövdesi `toShopId, warehouseId?, transferDate?, currency?, note?, items[]`;
`POST /shop-transfers/request` (alıcı) gövdesi `fromShopId, currency?, note?, items[]`. Kalem:
`{ plateId, quantity, unitPrice, widthMm?, heightMm? }` (tabakada `unitPrice` m² başına, `quantity` parça adedi;
ölçü verilmezse kalan tabakanın tamamı).

**Hemen tamamlanma** (onay beklemeden): kullanıcı karşı işletmeyi de yönetiyorsa (kendi şubeleri) ya da karşı
işletme gönderen işletmeye geçerli bir **otomatik onay** yetkisi (aşağıda) vermişse. Diğer her durumda onay gerekir.

**Güvenlik kuralları:** başkasının belgesine erişim `404` (varlığı belli edilmez); onay/ret yalnız **başlatmayan**
tarafın ilgili yazma iznine sahip üyesine açıktır (başlatan kendi teklifini onaylayamaz); onay anında
satıcı stoğu yeniden doğrulanır (aynı kalem iki işletmeye teklif edilmişse ikinci onay `409`/`400` ile reddedilir,
hayalet stok oluşmaz); işletme başına aynı karşı tarafa en çok 25 bekleyen teklif; satıcı alıcının stoğunu, maliyetini
ya da müşterilerini hiçbir zaman görmez — alıcı işletme malzemeyi kendi stoğunda yönetir (`trackingVisible`,
`state: untracked`); yalnız iki işletmeyi de yöneten kullanıcı için izleme bilgisi görünür.

Yanıtta (liste satırı da aynı) şu alanlar vardır: `status` (`pending|completed|rejected|cancelled`), `direction`,
`initiatorShopId`, `initiatedByMe`, `autoApproved`, `decidedAt`, `decisionNote`, `canDecide` (karar bizi bekliyor ve
yetkimiz var), `canWithdraw`, `canCancel` (hemen geri alma), `canRequestCancel`, `cancelRequest`
(`{ byShopName, byMe, at, note }`), `trackingVisible`, `detailVisible`, `summary`, `items[]` (kalem
`state`: `pending · untracked · in_stock · partial · sold · removed · cancelled`, `remainingRatio`, `usages[]`).
İlgili alanlar: `GET /plates` (başka işletmeden alınan kalemde) `origin`, `GET /sales` satışta `shopTransfer`.

### İşletmeler arası yetkiler (`/partners`)

| Metot | Yol | İzin | Açıklama |
|-------|-----|------|----------|
| GET | `/partners/grants` | ayar okuma | `{ given, received }` — verdiğim ve bana tanınan **geçerli** yetkiler. Engeller karşı tarafa gösterilmez |
| PUT | `/partners/grants` | **işletme yöneticisi** | `{ granteeShopId, permission, expiresAt?, note? }` — yetki ver/güncelle |
| DELETE | `/partners/grants/:id` | **işletme yöneticisi** | Yalnız kendi verdiğim yetkiyi kaldırır (başkasınınki `404`) |

`permission`: `auto_approve` (o işletmenin bana yönelttiği teklif/talepler onay beklemeden tamamlanır) ·
`view_stock` ("yalnız yetki verdiklerim" paylaşımlarımı görür) · `block` (beni göremez, işlem yönlendiremez, stoğumu
göremez; verdiğim diğer yetkiler kalkar; engelliyken yetki verilemez). `expiresAt` boş = **süresiz**; verilirse
gelecekte ve en çok 5 yıl sonrası olmalı. **Süresi dolan yetki okuma anında geçersiz sayılır** (zamanlayıcıya
bağlı değildir). Kendine yetki verilemez.

### "Bende var, satıyorum" (`/stock-shares`) ve pazar yeri (`/marketplace`)

| Metot | Yol | İzin | Açıklama |
|-------|-----|------|----------|
| GET | `/stock-shares` | stok okuma | Kendi paylaşım kurallarım: `[{ id, kind, refId, label, visibility, isActive, note, itemCount }]` |
| PUT | `/stock-shares` | stok yazma | `{ kind: plate\|template\|category, refId, visibility?: public\|partners, isActive?, note? }` — kural ekle/güncelle (kalem, ürün türü ya da malzeme türü grubu; yalnız **kendi** kaydım olabilir) |
| PATCH | `/stock-shares/:id` | stok yazma | `visibility` / `isActive` / `note` |
| DELETE | `/stock-shares/:id` | stok yazma | Kuralı siler |
| POST | `/stock-shares/set-all` | stok yazma | `{ isActive }` — bütün paylaşımı tek tuşla aç/kapat |
| GET | `/marketplace/listings?search=&shopId=&category=&page=&limit=` | satın alma okuma | Diğer işletmelerin **bana** listelediği stok |

Bir kalem bana şu **hepsi** doğruysa listelenir: kalem stokta, etkin ve silinmemiş; satıcı etkin ve ticarete açık;
satıcı beni engellememiş; kalemi kapsayan etkin bir kural var (kalem / türü / malzeme türü) ve kural ya
`public` ya da satıcı bana geçerli `view_stock` vermiş. **Aynı kural alım talebi doğrulamasında kullanılır**:
listelenmeyen kalem için talep açılamaz. Listede yalnız ad, tür, marka, renk, kalınlık, ebat, adet ve (varsa)
liste fiyatı bulunur; **maliyet, alış, tedarikçi ve müşteri bilgisi hiçbir zaman yoktur.**

### Başka işletmelerin ürün türlerinden seçme

| Metot | Yol | İzin | Açıklama |
|-------|-----|------|----------|
| GET | `/material-templates/community?q=&categoryName=&brandName=&colorName=&thicknessMm=&sheetWidthMm=&sheetHeightMm=` | katalog yazma + `trade` | Yeni ürün türü eklerken benzer, **kendi kataloğunuzda olmayan** türler: `[{ categoryName, templateName, measurementType, brandName, colorName, colorCode, thicknessMm, sheetWidthMm, sheetHeightMm, variant, shops }]` |

`categoryName` ya da `q` zorunludur (bütün ortak katalog dökülemez); sonuç aynı özellikteki türleri tek satırda
toplar, `shops` o özellikte türü olan işletme **sayısıdır** (işletme kimliği, adı, stok ve fiyat verilmez). Benzerlik
yazılan özelliklerle eşleşen alan sayısına göre sıralanır; ortak kullanım yalnız eşitlik bozar. Seçilen öneri
arayüzde formu doldurur; tür **kendi kataloğunuzda** açılır (başkasının kaydına bağlanmaz). Hız sınırı: kullanıcı
başına dakikada 60.

## Processing (İşleme)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/processing-rates` | 👥 | m² birim fiyat şablonları |
| POST | `/processing-rates` | 👔 | |
| POST | `/processing` | 🧑‍🔧 | İşleme kaydı; m² maliyet hesaplanır, cariye DEBIT yazılır |
| GET | `/processing` | 👥 | `?customerId=&plateId=&from=&to=` |

`POST /processing` gövdesi:
```json
{
  "plateId": "…",
  "customerId": "…",
  "quantity": 4,
  "widthMm": 2000,
  "heightMm": 1000,
  "ratePresetId": "…",          // şablondan al
  "overrideRatePerM2": 95.00,    // VEYA dinamik ez (öncelikli)
  "extraCost": 50.00
}
```

## Customers (Cari) & Payments
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/customers` | 🧑‍🔧 | |
| GET | `/customers` | 👥 | Filtre: `?search=&hasDebt=true&minDebt=&sort=balance` |
| GET | `/customers/:id` | 👥 | Müşteri + anlık borç |
| GET | `/customers/:id/ledger` | 👥 | Cari hareket dökümü (geçmiş) |
| GET | `/customers/:id/statement?from=&to=&scope=` | 👥 | Dönemlenmiş ekstre. Varsayılan: borcun **en son kapandığı** andan bugüne (`scope=all` tüm geçmiş, `from`/`to` serbest aralık). Dönem başı bakiyesi `openingBalance` (devir) olarak döner |
| DELETE | `/customers/:id/ledger/:entryId` | 🧑‍🔧 | Yanlış hareketi geri al (ödeme/indirim/manuel). Ödemeye bağlıysa ödeme kaydı + borç kapatma indirimi de silinir. Çalışan yalnızca son 3 gün, Sahip her zaman. Yanıt: `{ currentBalance }` |
| POST | `/customers/:id/payments` | 🧑‍🔧 | Ödeme al (nakit→çalışan / havale→banka zorunlu) |
| GET | `/customers/:id/payments` | 👥 | Ödeme geçmişi. İsteğe bağlı `?method=&from=&to=&page=&limit=`; `page` ya da `limit` verilirse sayfalı yanıt (`{ data, total, page, limit }`), verilmezse eskisi gibi düz liste |
| PATCH | `/customers/:id/payments/:paymentId` | 🧑‍🔧 | Ödemeyi düzelt; borç kapatma indirimi ters yönde dengelenir |
| DELETE | `/customers/:id/payments/:paymentId` | 🧑‍🔧 | Ödemeyi geri al; bağlı cari hareketleri (borç kapatma indirimi dahil) silinir |

`POST /customers/:id/payments` gövdesi (nakit):
```json
{ "amount": 1000.00, "method": "cash", "receivedById": "<employeeId>" }
```
Havale:
```json
{ "amount": 1000.00, "method": "bank_transfer", "bankAccountId": "<bankId>", "referenceNo": "FT-2026-0012" }
```

Yanıt: `{ payment, customer: { currentBalance } }` — kalan borç anında döner.

---

## v2 Uç Noktaları (çoklu depo/döviz · satış/konsinye · rapor · bildirim)

### Warehouses (Depolar)
| Metot | Yol | Yetki |
|-------|-----|-------|
| POST/PATCH/DELETE | `/warehouses(/:id)` | 👔 |
| GET | `/warehouses` | 👥 |

### Exchange Rates (Döviz)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/exchange-rates` | 👔 | `{ quoteCurrency, rate }` — 1 quote = rate × baz |
| GET | `/exchange-rates` | 👥 | Tanımlı kurlar |
| GET | `/exchange-rates/convert?amount=&from=&to=` | 👥 | Anlık çevirim |

### Materials (güncellenen)
- `POST /material-templates` artık `measurementType` (area/length/piece/weight) alır.
- `POST /plates` rulo/şerit için `measurementType=length`, `unitOfMeasure`, `attributes` (yükseklik/malzeme) ile;
  en/boy yalnızca `area` tipinde zorunlu. Açılış stoğu `warehouseId`'ye yazılır.
- `GET /plates` filtreleri: `?warehouseId=&ownerCustomerId=&measurementType=` eklendi.
- `GET /plates/:id/stock-levels` — depo/sahip bazlı stok (konsinye dahil).
- Tedarikçi fiyatında `unit=per_meter` desteklenir.

### Processing (güncellenen)
`POST /processing` artık birim-farkında:
```json
{ "plateId": "…", "customerId": "…", "billingUnit": "length",
  "lengthMeters": 12.5, "quantity": 1, "overrideRatePerUnit": 40, "currency": "TRY" }
```
`billingUnit` verilmezse malzemenin ölçüm tipinden alınır. `area`→en/boy, `length`→`lengthMeters`.

### Sales (Satış & Konsinye)
| Metot | Yol | Yetki |
|-------|-----|-------|
| POST | `/sales` | 🧑‍🔧 |
| GET | `/sales`, `/sales/:id` | 👥 |
| GET | `/sales/summary?from&to` | 👥 |

`GET /sales/summary` dönem toplamı: `{ count, saleTotal, businessMargin }` (varsayılan son 30 gün). Son satışlar listesi 100 kayıtla sınırlı olduğu için özet buradan gelir.

`POST /sales` gövdesi (kendi stok + üçüncü kişi komisyon karışık):
```json
{
  "buyerCustomerId": "…",
  "ownerCustomerId": "…",
  "warehouseId": "…",
  "currency": "TRY",
  "items": [
    { "plateId": "…", "quantity": 2, "unitPrice": 500, "stockSource": "business" },
    { "plateId": "…", "quantity": 1, "unitPrice": 1000, "stockSource": "third_party_untracked",
      "ownerSettlement": "commission_percent", "commissionPercent": 15 }
  ]
}
```
Yanıt: `{ sale, buyerBalance, ownerBalance }` — alıcı borçlanır, sahip alacaklanır, kâr = satış − sahip payı.

Sahibe ödeme (OUTGOING): `POST /customers/:ownerId/payments` gövdesine `"direction": "outgoing"` eklenir.

### Reports (Mali Raporlar — 👔 OWNER)
| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/reports/dashboard` | KPI özeti (alacak/borç, tahsilat, ciro, kritik stok) |
| GET | `/reports/aging` | Cari yaşlandırma (0–30/31–60/61–90/90+) |
| GET | `/reports/profit-loss?from=&to=` | Gelir-gider / kâr-zarar |
| GET | `/reports/stock-value?warehouseId=` | Stok değeri (depo + konsinye sahip kırılımı). Tabaka değeri = alış maliyeti × kalan m² (kayıt maliyeti yoksa ürün türünün maliyeti); maliyeti bilinmeyen kalemler `unvaluedItems` ile sayılır, değere katılmaz |
| GET | `/reports/top-debtors`, `/reports/top-creditors` | En borçlu/alacaklı |

### Notifications (Bildirim — 👔 OWNER)
| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/notifications?limit=` | Gönderim defteri (Log + Telegram + WhatsApp) |
| GET | `/notifications/stats` | Defterin büyüklüğü (kayıt sayısı, en eski tarih) |
| DELETE | `/notifications?olderThanDays=` | Defteri temizler; parametresiz tümünü siler. İş verisi etkilenmez |
| POST | `/notifications/telegram/reload` | Telegram'ı "yeniden başlat": ayarları tazeler, jetonu `getMe` ile doğrular. Yanıt: `{ ok, botUsername, chatId, backupChatId, error? }` |
| POST | `/notifications/telegram/test?topic=` | Ayarlardaki sohbete (konu verilirse o konunun sohbetine) deneme mesajı gönderir |

### Settings (Ayarlar)
| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/settings/business` | İşletme kimliği (belgelerde kullanılır). `portalBaseUrl` ve `logoPath` **yalnız sistem sahibine dolu** gelir, işletmeye boş |
| PUT | `/settings/business` | İşletme kimliğini güncelle; yanıt çözümlenmiş kimliktir (ham ayar satırı değil). `portalBaseUrl` / `businessLogoPath` işletmeden gelirse **403** (boş değer yok sayılır); `portalBaseUrl` http(s):// olmalı |
| GET / PUT | `/settings/pricing` | Malzeme satış kâr yüzdesi ve konsinye komisyonu |
| GET / PUT | `/settings/cut-pricing` | **İşleme birim ücretleri — tek menü:** `areaRate` (m²), `meterRate` (metre), `hourlyRate` + `minMinutes` (süre), `pieceRate` (adet). `minArea`, `feedMmS`, `rapidMmS`, `plungeSec`, `passDepthMm` yalnız **Corel özelliği açık** işletmede gelir/yazılır |
| GET / PUT | `/settings/telegram` | Telegram. **İşletme görünümü:** `{ configured, botReady, botUsername, chatId, routes[], ownerView:false }` — bot jetonu, yedek sohbeti, yetkili kullanıcılar, `.env` sohbeti ve başka işletme adları **hiç yoktur**. **Sistem sahibi görünümü** (`ownerView:true`): ayrıca maskeli jeton, kaynak, yedek sohbeti, `allowedUserIds`, `chatSharedWith`. PUT: `telegramChatId` ve `telegramRoutes` işletmenin; `telegramBotToken`, `backupTelegramChatId`, `telegramAllowedUserIds` yalnız sistem sahibinin (işletmeden **403**). İşletme yeni sohbet kimliği yazarken biçim denetlenir ve bot o grupta mı Telegram'dan doğrulanır (kişisel sohbet reddedilir). Alan gönderilmezse değişmez, **boş** gönderilirse temizlenir. `telegramRoutes: { sales: { chatId }, … }` verilen nesne öncekinin yerine geçer |
| GET / POST / DELETE | `/settings/corel`, `/settings/corel/rotate` | Corel anahtarı — **Corel özelliği gerekir** (kapalıysa 403) |
| GET / PUT | `/settings/folders` | Klasör oluşturucu — **Corel özelliği gerekir** |
| GET | `/corel-runners` | Runner durumu — **Corel özelliği gerekir** |

**Özellik yetkisi (`ShopFeatureRequired`)**: `corel` → yukarıdaki uçlar + `/corel/*` (anahtar kapalı
işletmede de reddedilir) + `POST /quotes/:id/request-folders`; `directory` → `/directory/*`;
`network` → `/customer-network/*`. Kapalıyken yanıt `403` ve `… bu hesapta etkin değil`.
`GET /shops/mine` ve `GET /auth/me` işletme başına çözülmüş `features` döner.

**Telegram konuları** (`routes` her dükkânın kendisinin): `sales` satışlar,
`payments` tahsilat (sohbeti olmayan müşterinin), `stock` kritik stok, `debt`
borç hatırlatma (sohbeti olmayan borçlunun), `morning` sabah özeti, `corel`
Corel ve klasörler (runner klasör açtı · sorun bildirdi / düzeldi · bağlantısı
koptu / geri geldi). Her konu bildirim sohbetine, başka bir sohbete gider ya
da kapalıdır. Dükkânlar aynı sohbeti paylaşabilir; birden çok açık dükkân
varken mesajın ilk satırı `🏪 Dükkân adı`dır. Müşterinin kendi sohbetine
giden mesaj ve yedek yönlendirmeden etkilenmez. `GET /settings/telegram`
`routes[]` (`mode: default|chat|off`, `effectiveChatId`) döner; `sharedWith[]`
ve `chatSharedWith[]` (aynı sohbeti kullanan diğer dükkânlar) **yalnız sistem
sahibine** gelir. Corel özelliği kapalı işletmede `corel` konusu listelenmez.

### Backups (Yedekleme — 👔 OWNER)
| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/backups` | Diskteki otomatik yedekler |
| GET | `/backups/usage` | Yedek klasörü kullanımı (dosya sayısı, toplam bayt) |
| DELETE | `/backups?keep=5` | Eski yedek dosyalarını siler (en yeni `keep` korunur; 0 → hepsi) |
| GET | `/backups/download` | Anlık yedek (.sql) indir |
| POST | `/backups/restore` | Yedeği geri yükle. Düz `.sql` **veya** şifreli `.enc` kabul edilir |
| POST | `/backups/telegram` | Şifreli yedeği elle Telegram'a gönder |
| GET | `/backups/telegram/state` | O güne ait Telegram yedek durumu |
| GET | `/backups/decryption-key` | Şifre çözme (private) anahtarı + public parmak izi |

`POST /backups/restore` — `multipart/form-data`: `file` (zorunlu) ve
`privateKeyPem` (opsiyonel). Şifreli dosyada anahtar sırası: istekte anahtar
geldiyse o kullanılır; gelmediyse **önce sunucudaki geçerli şifre çözme
anahtarı** denenir. O da çözemezse yanıt `400` olur ve gövdede
`needsKey: true` döner → arayüz kullanıcıdan anahtarı ister (eski bir
anahtarla şifrelenmiş yedekler için). Başarılı yanıt:
`{ restored: true, decrypted: <bool> }`.

### Telegram bot komutları
| Komut | Nerede | Ne yapar |
|-------|--------|----------|
| `/idx` (veya `/idx@BotAdi`) | Grup veya özel sohbet | O sohbetin kimliğini, dokunup kopyalanabilecek biçimde cevaplar |

Bot, güncellemeleri kısa aralıklı `getUpdates` yoklamasıyla okur (webhook
gerekmez). Sunucu yeniden başladığında bekleyen eski komutlar **cevaplanmaz**;
yalnızca imleç ileri alınır. Bot jetonu tanımlı değilse yoklama yapılmaz.
Aynı bot için başka bir tüketici/webhook etkinse Telegram `409` döner ve durum
bir kez loglanır.

Telegram jetonu ve sohbet kimliği **gönderim anında** okunur (açılışta bir kez
değil) → arayüzden değiştirince sunucuyu/container'ı yeniden başlatmak
gerekmez. Öncelik: veritabanı (arayüz) → `.env`. Yedek gönderim sıklığı
(`BACKUP_TELEGRAM_CRON`) hâlâ `.env`'den okunur ve değişikliği yeniden başlatma
ister.

---

## v3 Uç Noktaları (teklif/kuyruk · belge/excel · portal · WhatsApp)

### Quotes (Teklif/Proforma)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/quotes` | 🧑‍🔧 | Karışık teklif (satış + işleme kalemleri); yalnızca hesap, cari/stok hareketi yok — **`finalize` verilmedikçe**. Geriye dönük giriş alanları aşağıda |
| GET | `/quotes`, `/quotes/:id` | 👥 | Filtre: `?status=&buyerCustomerId=&plateId=&from=&to=&search=` (`search`: teklif no ya da müşteri adı). Karara bağlanmamış (taslak/gönderildi) teklifler daima en üstte; filtre yoksa son 1 hafta. Birim fiyat ölçü birimine göre uygulanır (m² malzemede tabaka kalan en×boy üzerinden) |
| PATCH | `/quotes/:id` | 🧑‍🔧 | Teklifi yeniden yazar (DRAFT/SENT iken) |
| PATCH | `/quotes/:id/status` | 🧑‍🔧 | `{ status: draft\|sent\|accepted\|rejected\|expired }` |
| POST | `/quotes/:id/convert` | 🧑‍🔧 | ACCEPTED teklifi gerçeğe döker: SALE kalemleri → 1 Satış (anında borç), PROCESSING kalemleri → üretim kuyruğuna PENDING iş (tamamlanınca faturalanır) |
| GET | `/quotes/:id/print` | 🧑‍🔧 | Düzenlenebilir HTML şablondan (`templates/quote.html`) yazdırılabilir teklif (UTF-8; Ctrl+P ile PDF) |
| GET | `/quotes/:id/csv` | 🧑‍🔧 | Teklif kalemlerinin CSV (tablo) çıktısı |

`POST /quotes` gövdesi (karışık):
```json
{
  "buyerCustomerId": "…", "currency": "TRY",
  "items": [
    { "lineKind": "sale", "plateId": "…", "quantity": 3, "unitPrice": 500, "stockSource": "business" },
    { "lineKind": "processing", "plateId": "…", "quantity": 2, "unitPrice": 40, "billingUnit": "length", "lengthMeters": 12.5 }
  ]
}
```

**Geriye dönük giriş** (`POST /quotes`, `PATCH /quotes/:id` gövdesine ek alanlar):

| Alan | Açıklama |
|------|----------|
| `quoteDate` | Teklif tarihi (ISO). Liste/filtre/yazdırma `COALESCE(quoteDate, createdAt)` ile çalışır; dönüşümde satış tarihi ve işleme tarihleri bundan gelir |
| `skipFolders` | `true` ise runner bu teklif için **bugüne klasör açmaz** (`/corel/jobs` listesine girmez). Verilmezse `quoteDate` bugünden önceyse `true` kabul edilir. Sonradan teklif kartındaki "Klasörü teklif gününe aç" `/corel/jobs/requested` üzerinden klasörü teklifin **gerçek gününe** açtırır |
| `finalize` | `convert` → kaydeder, kabul eder, satış/işlemeye dönüştürür; `complete` → ek olarak işleme işlerini **kalem tarihleriyle tamamlanmış** ekler. Yanıt: teklif + `conversion: { saleId, processingJobIds, completed }`. Dönüşüm hata verirse teklif taslak kalır |
| `items[].itemDate` | Kalemin tamamlanma/işlenme tarihi; boşsa `quoteDate`. Tamamlanan işte işlenme ve tamamlanma tarihi bu gündür, cari ekstre de bu tarihi izler |
| `items[].newMaterial` | Stokta olmayan / müşterinin X tarihinde getirdiği malzeme: `{ templateId, widthMm?, heightMm?, quantityInStock?, ownerCustomerId?, addedAt?, warehouseId? }` (şablon yoksa `categoryName/brandName/colorName/thicknessMm…` adlarıyla da verilebilir). Teklif kaydedilirken **aynı işlemde** tek parça olarak stoğa eklenir (`addedAt` boşsa `quoteDate`) ve kalemin plakası olur |

```json
{
  "buyerCustomerId": "…", "quoteDate": "2026-03-02", "finalize": "complete",
  "items": [
    { "lineKind": "processing", "quantity": 1, "unitPrice": 300, "billingUnit": "area",
      "widthMm": 100, "heightMm": 200, "itemDate": "2026-03-05",
      "newMaterial": { "templateId": "…", "widthMm": 100, "heightMm": 200, "addedAt": "2026-02-28" } }
  ]
}
```

### Processing — Üretim Kuyruğu & Makineler
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/processing/queue` | 👥 | Aktif (pending/in_progress) işler, makineye göre gruplu; `?status=&machineId=` |
| GET | `/processing/queue/count` | 👥 | Aktif iş sayısı → `{ count }` (menü rozeti; kuyruğun tamamını indirmez) |
| GET | `/processing/queue/plate-ids` | 👥 | Aktif işlerdeki kalem kimlikleri → `string[]` (teklif formu) |
| PATCH | `/processing/bulk` | 🧑‍🔧 | **Toplu tarih/not düzenleme** (geçmiş işler): `{ ids[1..500], processedAt?, completedAt?, sameDay?, note? }`. Verilmeyen alana dokunulmaz; `sameDay: true` tamamlanmayı işlenme gününe eşitler (yeni `processedAt` yoksa işin kendi gününe). Tutar/stok değişmez, ekstre tarihi yeni güne taşınır. Yanıt `{ updated, failed: [{id, reason}] }` — biri başarısız olursa diğerleri sürer |
| PATCH | `/processing/:id/status` | 🧑‍🔧 | `{ status }` — COMPLETED: stok düşer + (ertelenmişse) cari DEBIT (idempotent); CANCELLED: iade |
| POST/PATCH/DELETE | `/machines(/:id)` | 👔 | Makine tanımları |
| GET | `/machines` | 👥 | |

`POST /processing` artık `billOnCompletion` (tamamlanınca faturala), `machineId`, `status` alır.

### Documents (PDF · yazdırılabilir HTML · Excel/CSV)
| Metot | Yol | Yetki | Tür |
|-------|-----|-------|-----|
| GET | `/customers/:id/statement.pdf` | 👥 | **PDF cari ekstre** (A4, gömülü Türkçe yazı tipi, çok sayfalı: başlık satırı her sayfada tekrarlanır, "Sayfa x / y"). Dönem: `?scope=all` · `?from=&to=` · varsayılan son borç kapatmadan bugüne. Tarayıcıda açılır; `?download=1` dosya olarak indirir. Dosya adı `ekstre-<müşteri>.pdf` |
| GET | `/customers/:id/statement/print` | 👥 | Aynı ekstre, yazdırılabilir HTML (Ctrl+P ile PDF). (`/customers/:id/statement` müşteri modülünün JSON ekstresidir.) |
| GET | `/customers/:id/statement.csv` | 👥 | Ekstre CSV (Excel'de açılır) |
| GET | `/sales/:id/print`, `/processing/:id/print`, `/quotes/:id/print` | 👥 | Yazdırılabilir HTML fatura / fiş / teklif (Ctrl+P ile PDF) |
| GET | `/expenses/report/print`, `/reports/financial/print` | 👔 | Yazdırılabilir HTML gider / mali rapor |
| GET | `/reports/{aging,profit-loss,stock-value}.xlsx` | 👔 | Excel rapor |
| GET | `/customers/:id/ledger.xlsx` | 👔 | Excel cari ekstre |

PDF, `DocumentPdfService` ile HTML'in kullandığı **aynı belge modelinden** (`DocModel`)
üretilir: ekranda gördüğünüz ile indirdiğiniz içerik aynıdır. Yazı tipi
Liberation Sans'tır (SIL OFL; `src/modules/documents/fonts/`, derlemede `dist`'e kopyalanır;
`dist`, `src` ve sistem klasörleri sırayla aranır). Dosya bulunamaz ya da bozuksa PDF
Helvetica ile üretilir (Türkçe harfler sadeleşir) ve açılışta/üretimde günlüğe uyarı yazılır.

PDF/ekstre üretimi beklenmedik bir hatayla bozulursa istemciye genel "Beklenmeyen bir hata
oluştu." yerine kısa neden döner (`500`, `PDF oluşturulamadı: <neden>` ya da
`Ekstre hazırlanamadı: <neden>`; dosya yolları gizlenir, tam yığın sunucu günlüğündedir).
Arayüzdeki PDF penceresi bu iletiyi olduğu gibi gösterir.

### Portal (Müşteri self-servis — 🔓 Public, token'lı)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/customers/:id/portal-token` | 🧑‍🔧 | Token üret/yenile → `{ token, url }` |
| DELETE | `/customers/:id/portal-token` | 🧑‍🔧 | Erişimi iptal et |
| GET | `/portal/:token` | 🔓 | Ad + güncel bakiye (salt-okunur) |
| GET | `/portal/:token/ledger` | 🔓 | Son cari hareketler |
| GET | `/portal/:token/documents` | 🔓 | Son satış/işleme belgeleri |

### Notifications — WhatsApp
WhatsApp kanalı (Meta Cloud API) Telegram ile aynı port; `WHATSAPP_TOKEN` +
`WHATSAPP_PHONE_NUMBER_ID` tanımlıysa etkin, değilse pasif (Log + Telegram çalışır).
Alıcı: müşterinin `phone` alanı (E.164).

---

## Telegram arayüzü (interaktif bot)

Bot, web uygulamasındaki günlük işlemleri sohbet üzerinden yaptırır. Menüler
inline düğmelerle gezilir; bir şey yazmanız gerektiğinde bot bunu söyler.

### Güvenlik
Her mesaj ve her düğme basışı, **işlenmeden önce** gönderenin erişimine göre
doğrulanır:

1. Telegram kimliği bir StockTrack hesabına yazılıysa (**Ekip** ekranında
   üyenin hesabı, `PATCH /shops/:id/members/:mid/account { telegramUserId }`)
   kişi botta **yalnız üye olduğu dükkânları**, o dükkândaki izinleriyle görür
   (tahsilat için *ödeme yazma*, stok için *stok okuma*, rapor için *rapor
   okuma*; yedek yalnız sistem sahibine). Tek dükkânı olan dükkân düğmesi
   görmez.
2. Yalnız sistemin yetkili listesindeyse (`Ayarlar › Telegram › Yetkili
   kullanıcılar`, sistem sahibinin eklediği kişiler) bütün açık dükkânlara
   tam yetkiyle girer.

İkisi de değilse — liste boşken **hiç kimse** — yetkili değildir. Yetkisiz kişiye yalnızca kendi
kullanıcı kimliği söylenir; hiçbir iş verisi dönmez, hiçbir işlem yapılmaz.

Tek istisna `/idx`: yetki istemez ama sadece sohbet ve kullanıcı kimliğini
söyler — iş verisine dokunmaz. Bu olmadan kimse listeye eklenemezdi.

### Komutlar
| Komut | Ne yapar |
|-------|----------|
| `/menu`, `/start` | Ana menü |
| `/idx` | Bu sohbetin ve sizin kimliğiniz |
| `/iptal` | Yarım kalan işlemi bırakır |
| `/yardim` | Yardım ekranı |

### Menüden yapılabilenler
- **Cari/Müşteri** — ada/firmaya/telefona göre arama, bakiye ve son hareketler,
  tüm hareketleri içeren ekstre özeti
- **Tahsilat** — tutar → yöntem (nakit/havale/kart) → nakitte çalışan, havalede
  banka hesabı → onay → kayıt. Kalan bakiye anında döner
- **Borç kapatma** — tamamını tahsil et · bir kısmını al kalanı indirim ·
  para almadan kapat (ayrı onay ister)
- **Cariye elle borç/alacak ekleme**
- **Stok** — ürün türüne göre listeleme (sayfalı) ve serbest arama
- **Raporlar** — en borçlu müşteriler, alacaklılar, bu ayın kâr-zararı
- **Yedek** — şifreli yedeği anında alıp sohbete gönderme

Bot `getUpdates` ile **tek tüketici** olarak çalışır; aynı jeton için ikinci bir
tüketici (webhook dâhil) varsa Telegram `409` döner ve durum bir kez loglanır.


---

## Katalog, fiyatlandırma ve toplu stok girişi

### Kopya engelleme
Tür/marka/renk/ebat/kalınlık kayıtlarında "aynı kayıt" kararı normalize edilmiş
ad üzerinden verilir (baş-son boşluk atılır, iç boşluklar teke iner, Türkçe
kurallarına göre küçültülür). `POST` uçları kopya AÇMAZ: aynı ad zaten varsa
mevcut kayıt döner. Tür kodu (`code`) zorunlu değildir; addan üretilir.

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/material-catalog/duplicates` | 👔 | Kopyaları **yalnızca listeler** (değiştirmez) |
| POST | `/material-catalog/dedupe` | 👔 | Kopyaları birleştirir; sonucu raporlar |

Birleştirme yıkıcı değildir: her kümede **en eski** kayıt korunur, kopyalara
bağlı şablon/stok/alt katalog referansları ona taşınır, kopyalar ancak ondan
sonra soft-delete edilir. Tek transaction; hiçbir stok, teklif, satış veya cari
kaydı silinmez.

### Toplu stok girişi (otomatik tanımlama)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/plates/batch` | 🧑‍🔧 | `{ items: [...] }` — tek istekte 100 kaleme kadar |

Kalemde katalog kayıtları kimlik yerine **adla** verilebilir: `categoryName`,
`brandName`, `colorName`, `thicknessMm`, `sheetWidthMm/sheetHeightMm`,
`templateName`. Karşılığı yoksa kendiliğinden açılır (gerekirse şablon da).
`copies` ile aynı özellikte N ayrı parça kaydı oluşturulur. Yanıt:
`{ created, plateIds, autoCreated: { categories, brands, colors, sizes, thicknesses, templates } }`
— hangi katalog kayıtlarının yeni açıldığı raporlanır.

### Görünüm tercihleri
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/settings/display` | 👥 | `{ showLedgerUndo }` — arayüz düğmeleri buna göre çizilir |
| PUT | `/settings/display` | 👔 | `{ showLedgerUndo? }` |

`showLedgerUndo` **varsayılan `false`**: cari ekstresindeki "Geri al" düğmeleri
gizlidir. Ekran müşteriye gösterildiğinde ödeme/borç silme düğmesi görünmesin
diye. Bu yalnızca **görünümü** etkiler — yetki kuralları değişmez; silme uçları
her zaman rol ve süre denetiminden geçer.

### Satış fiyatlandırması
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/settings/pricing` | 👥 | Genel kâr yüzdesi + konsinye komisyon oranı |
| PUT | `/settings/pricing` | 👔 | `{ saleMarkupPercent?, consignmentCommissionPercent? }` |
| GET | `/plates/:id/pricing` | 👥 | Satış fiyatı önerisi ve piyasa karşılaştırması |
| PUT | `/plates/:id/retail-price` | 🧑‍🔧 | `{ retailPrice, currency?, markupPercent? }` — perakende fiyatı girer/günceller |
| DELETE | `/plates/:id/retail-price` | 🧑‍🔧 | Kalemin kendi fiyatını (ve kâr yüzdesini) kaldırır; öneri varsa fiyat çatısından gelir |
| GET | `/plates/:id/retail-suggestions` | 👥 | Aynı türdeki (marka/renk farklı) fiyatı tanımlı malzemeler |
| GET | `/plates/costs?ids=a,b,…` | 👥 | Kalemlerin alış maliyeti (en çok 200 kimlik; geçersizler yok sayılır) → `{ [plateId]: PlateCost }` |
| GET | `/plates/pricing?ids=a,b,…` | 👥 | Birden çok kalemin satış fiyatı önerisi tek istekte (en çok 100; geçersizler yok sayılır) → `{ [plateId]: PlatePricing }` |
| GET | `/plates/owners` | 👥 | Stokta malı olan müşteriler → `[{ id, name }]` (stok listesinde sahip süzgeci) |

Perakende fiyat **TRY (varsayılan), USD veya EUR** girilebilir; `retailCurrency`
plakada saklanır. Hesaplar baz para biriminde yapılır — döviz, tanımlı kurdan
çevrilir. Kur tanımlı değilse `retailPriceBase` ve `suggestedUnitPrice` `null`
döner (fiyat elle girilir). Yanıt hem girilen değeri (`retailPrice` +
`retailCurrency`) hem çevrilmiş karşılığını (`retailPriceBase`) taşır.

`retail-suggestions`, fiyatı olmayan bir malzemeye aynı türdeki başka bir
malzemenin fiyatını uygulamak için kullanılır; aynı kalınlıktakiler
(`sameThickness`) listenin başında gelir.

Kural: **satış birim fiyatı = taban fiyat × (1 + kâr%)**. Taban fiyat
kalemin kendi perakende fiyatıdır (`retailPrice`, plakada tutulur, ölçü birimi
malzemenin ölçüm tipiyle aynı: m² / metre / adet); yoksa kaleme uyan en özel
**fiyat çatısının** referans fiyatıdır (aşağıda). Kâr yüzdesi plakaya özel
girilmişse (`markupPercent`) o, yoksa çatınınki, yoksa ayarlardaki genel oran.

`/plates/:id/pricing` yanıtındaki ek alanlar:

| Alan | Açıklama |
|------|----------|
| `priceSource` | `plate` (kalemin kendi fiyatı), `rule` (fiyat çatısı) ya da `null` (fiyat yok, elle girilir) |
| `basePrice` | Kâr eklenmeden önceki birim fiyat — baz para biriminde, ölçü birimi başına |
| `rule` | Kaleme uyan en özel çatı (kalem fiyatı öncelikli olsa da gösterilir): `id, label, supplierId, supplierName, price, currency, unit, autoPicked, priceUpdatedAt, unitPriceBase, markupPercent` |
| `cost` | Alış maliyeti (`PlateCost`, aşağıda) ya da satın alma kaydı yoksa `null` |
| `marginPercent` | Önerilen fiyattaki kâr yüzdesi: `(önerilen − unitCost) / unitCost × 100`, 1 ondalık; maliyet ya da öneri yoksa `null` |

`PlateCost`: `plateId, unitCost` (ölçü birimi başına, baz para biriminde;
alan hesaplanamazsa `null`), `unit, purchaseUnitPrice, currency, purchaseDate,
supplierName, source`. Maliyet kalemin son satın alma satırından gelir
(`source: "plate"`); yoksa aynı ürün türünün son alışı kullanılır
(`source: "template"`). Tabaka başına alış, ürün türünün standart tabaka
alanına (yoksa alınan kalemin ölçüsüne) bölünerek m² maliyetine çevrilir.
Döviz, alış tarihindeki kurla (o tarihte kur yoksa son kurla) çevrilir.
Satılıp tükenmiş kalemlerin maliyeti de döner. Teklif ekranı satış
kalemindeki kârı `birim fiyat − unitCost` üzerinden hesaplar.

Malzemeci (tedarikçi) fiyatlarıyla karşılaştırma yapılırken tabaka başına
girilen fiyatlar standart tabaka alanına bölünerek m² fiyatına çevrilir;
dövizli fiyatlar son kurla baz para birimine çevrilir. Karşılaştırmaya kalemin
malzemeci fiyatlarıyla birlikte uyan çatıdaki malzemeci fiyatları da girer.
Bizim fiyatımız daha düşükse `discountPercent` döner ("piyasadan %X uygun");
piyasadan pahalıysak `null`. Bu oran teklif ekranında canlı gösterilir ve
satış anında cari ekstre açıklamasına da yazılır.

### Fiyat çatıları
Bir grup malzemeye ortak referans fiyat: **kategori** (zorunlu) + isteğe bağlı
**marka, kalınlık, renk, ebat (standart tabaka), alt tür**. Boş alan "hepsi"
demektir: "tüm pleksiler", "2.8 mm pleksiler", "beyaz pleksiler", "Akpolimer
2.8 mm beyaz pleksi". Katalog alanına aittir (`catalog` okuma / yazma).

| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/price-rules?categoryId=` | Çatılar: kapsam, `label`, `unit`, `markupPercent`, `entries[]` (malzemeci, fiyat, para birimi, `priceBase`), `reference`, `coverage { matched, effective, ownPrice }` |
| GET | `/price-rules/preview?categoryId=&brandId=&thicknessId=&colorId=&sizeId=&variant=&excludeId=` | Kaydetmeden önce: `{ label, matched, effective, samples[], duplicate }` |
| GET | `/price-rules/:id` | Tek çatı |
| POST | `/price-rules` | `{ categoryId, brandId?, thicknessId?, colorId?, sizeId?, variant?, unit?, markupPercent?, note? }` — aynı kapsam varsa 409 |
| PATCH | `/price-rules/:id` | Aynı alanlar + `isActive` |
| DELETE | `/price-rules/:id` | Çatı ve fiyatları silinir |
| PUT | `/price-rules/:id/entries` | `{ supplierId?, price, currency?, note?, makeReference? }` — malzemeci başına tek satır (ekle/güncelle); `supplierId` boşsa işletmenin liste fiyatı |
| DELETE | `/price-rules/:id/entries/:entryId` | Fiyatı sil (referanssa en ucuza döner) |
| PUT | `/price-rules/:id/reference` | `{ entryId }` — çatı fiyatı olacak malzemeci; `null` → her zaman en ucuz |

- **Birim** (`unit`) çatının bütün fiyatları için tektir: `per_m2`, `per_plate`
  (tabaka/adet), `per_meter`, `per_kg`. Verilmezse tabaka malzemede ebat
  seçildiyse `per_plate`, değilse `per_m2`. Tabaka fiyatı kalemin standart
  tabaka alanına bölünür.
- **Para birimi** TRY ya da döviz (USD, EUR ...); hesapta **son kurla** baz
  para birimine çevrilir. Kur yoksa o fiyat öneride kullanılamaz.
- **Referans:** `reference` seçilen fiyattır; seçilmemişse (ya da silinmişse)
  TRY karşılığı en ucuz olan (`autoPicked: true`). İlk eklenen fiyat arayüzde
  kendiliğinden referans yapılır.
- **Hangi çatı geçerli:** kaleme uyan çatılardan en çok alanı tutan; eşitlikte
  kalınlık > ebat > marka > alt tür > renk. Eşleşmede kalemin kendi değeri,
  yoksa ürün türünün varsayılanı kullanılır. Pasif çatı uygulanmaz.
- `coverage`: stokta olan etkin kalemlerden kaçının kapsamda olduğu
  (`matched`), kaçında bu çatının geçerli olduğu (`effective`) ve bunlardan
  kaçının kendi fiyatı olduğu (`ownPrice` — onlarda kalem fiyatı kullanılır).


---

## Döviz kurları (otomatik)

Kurlar **anahtar gerektirmeyen açık API'lerden** otomatik çekilir; kayıt ya da
jeton gerekmez:

1. `https://open.er-api.com/v6/latest/{BASE}` (birincil)
2. `https://api.frankfurter.app/latest?from={BASE}` (yedek — Avrupa Merkez Bankası)

`{BASE}` yerine sistemin baz para birimi (varsayılan `TRY`) yazılır. İlk adres
ulaşılamazsa sıradaki denenir. `EXCHANGE_RATE_API_URL` **boş bırakılabilir**;
doldurulursa virgülle birden çok adres verilebilir ve yerleşik sağlayıcıların
yerine geçer.

Ne zaman çekilir: uygulama **açılışında bir kez** ve ardından
`EXCHANGE_RATE_SYNC_CRON` (varsayılan her gün 06:00). `SCHEDULER_ENABLED=false`
ise çalışmaz.

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/exchange-rates` | 👥 | Tanımlı kurlar |
| GET | `/exchange-rates/ticker?quotes=USD,EUR` | 👥 | Arayüz şeridi: `{ baseCurrency, rates: [{ currency, rate, asOf, source }] }` |
| POST | `/exchange-rates/sync` | 👔 | Kurları **şimdi** çeker; `{ updated }` döner |
| POST | `/exchange-rates` | 👔 | Kuru elle gir/güncelle |

Sağlayıcılar "1 baz birim kaç döviz eder" verir (1 TRY = 0,029 USD);
veritabanında **tersi** saklanır (1 USD = 34,48 TRY) — uygulama kurları her
zaman "1 döviz = N TL" yönünde okur. Sağlayıcı beklenen tabanı vermezse veriler
**yazılmaz** (sessizce ters hesap yapılmaz).

---

## Çevrimdışı çalışma (arayüz)

Sunucuya (ya da veritabanına) ulaşılamadığında arayüz çalışmaya devam eder:

- **Uygulama kabuğu** (sayfa, JS, CSS) tarayıcıda saklanır (`/sw.js`, yalnız
  HTTPS ya da localhost'ta); sunucu kapalıyken sayfa yine açılır.
- **Okuma:** her başarılı GET yanıtı cihazda (IndexedDB) saklanır; çevrimdışıyken
  son kopya gösterilir. Listelerde yazılan arama çevrimdışıyken cihazdaki
  kopyalarda yapılır.
- **Yazma:** müşteri ekleme/düzenleme, tahsilat, indirim/borç kapatma, teklif
  (ekleme, düzenleme, durum), satış, iş (ekleme, durum), gider, satın alma ve
  stok girişi **sıraya alınır**; diğerleri (silme, dönüştürme, ayar, ekip)
  açık bir uyarıyla reddedilir. Yeni kayıt geçici bir kimlik alır; aynı
  kuyrukta ona bağlı işlemler (yeni müşteriye tahsilat) kayıt sunucuda
  açılınca gerçek kimliğe çevrilir.
- **Eşzamanlama:** sağlık ucu tekrar `200` olunca kuyruk sırayla, her işlem
  kendi `Idempotency-Key`'iyle (bir kez işlenir) gönderilir. Sunucunun
  reddettiği işlem "işlenemedi" olarak kalır, ona bağlı olanlar bekler;
  kullanıcı düzeltip yeniden dener ya da siler.
- **Çöp temizliği:** gönderilen işlemler kuyruktan, 14 günden eski ve
  sınırı (400) aşan kopyalar önbellekten, eski sürüm dosyaları kabuktan
  silinir; oturum kapanınca o kullanıcının önbelleği silinir (kuyruğu
  kalır). Sunucuda tekrar koruması kayıtları her gece temizlenir.

## CorelDRAW eklentisi (ac2f pack)

Corel'deki `ac2fJob` modülü müşteriyi ve stoktaki malzemeyi buradan okur;
dışa aktarılan DXF ile takım yolu klasörlerine ad bu bilgilerle verilir.
Uçlar **salt-okunurdur**, hiçbir kayıt yazmaz.

**Kimlik:** JWT değil, `X-Api-Key` başlığı. Anahtar *Ayarlar › Corel
entegrasyonu* bölümünden üretilir ve eklentinin kurulumuna bir kez
yapıştırılır. Anahtar boşken entegrasyon kapalıdır (401). **Her dükkânın
kendi anahtarı vardır ve anahtar dükkânı belirler:** eklenti hangi anahtarı
taşıyorsa o dükkânın müşteri/stok/teklif listesini görür (`X-Shop-Id`
gerekmez).

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/settings/corel` | ayarlar (yazma) | `{ enabled, apiKey }` — anahtar bir tür paroladır |
| POST | `/settings/corel/rotate` | ayarlar (yazma) | Yeni anahtar; eskisi anında geçersiz |
| DELETE | `/settings/corel` | ayarlar (yazma) | Anahtarı siler, entegrasyonu kapatır |
| GET | `/corel/ping` | 🔑 | `ok <TAB> işletme adı <TAB> klasör kodu` |
| GET | `/corel/folder-settings` | 🔑 | Runner: dükkânın klasör oluşturucu ayarları (JSON) `{ shopName, enabled, code, customCode, materialSaleFolders, dayRoot }` |
| GET/PUT | `/settings/folders` | ayarlar | Aynı ayarlar, arayüz için: `{ enabled?, code?, materialSaleFolders?, dayRoot? }` |
| GET | `/corel/customers?q=&limit=` | 🔑 | Müşteriler; `q` boşsa son güncellenenler |
| GET | `/corel/customers/:id` | 🔑 | Tek müşteri |
| GET | `/corel/materials?customerId=&q=&limit=` | 🔑 | Stoktaki tabakalar; müşterinin malzemesi önce |
| GET | `/corel/quotes?customerId=&limit=` | 🔑 | Müşterinin son teklifleri (yeniden eskiye) |
| GET | `/corel/quotes/:id/usage` | 🔑 | Teklifin tabaka kalemleri ve kullanılan ölçü |
| GET | `/corel/pricing` | 🔑 | Kesim fiyatlandırması (süre ve m² modülleri) |
| GET | `/corel/jobs?since=&limit=` | 🔑 | İşe dönüştürülmüş teklifler, dönüşüm sırasıyla (`since` dahil). **JSON** döner: dükkân bilgisayarındaki [stock-track-runner](https://github.com/ac2f/stock-track-runner) bunları okuyup müşteri ve takım yolu klasörlerini açar |
| GET | `/corel/jobs/requested` | 🔑 | Klasörleri arayüzden yeniden istenmiş ve o istekten sonra açılmamış teklifler (aynı JSON) |
| POST | `/corel/jobs/:id/folders` | 🔑 | Runner: `{ host, folder, report?[], problems?[] }` — teklifin klasörleri açıldı; teklife `folders_*` yazılır |
| POST | `/corel/runner/heartbeat` | 🔑 | Runner nabzı, her turda: `{ host, version?, startedAt?, pollSeconds?, dayRoot?, dayRootSource?, error? }` |
| GET | `/corel-runners` | 👥 (oturum) | Runner'ların durumu: `host, online, secondsAgo, lastSeenAt, version, dayRoot, dayRootSource, lastError, lastJobQuoteNo, lastJobAt, lastFolder`. `online`: son nabız 3 tur + 15 sn içinde |
| DELETE | `/corel-runners/:id` | ayarlar (yazma) | Kullanılmayan bilgisayarı listeden kaldırır |
| POST | `/quotes/:id/request-folders` | teklif (yazma) | İşe dönmüş teklifin klasörlerini runner'dan yeniden ister (runner kapalıyken dönen ya da klasörü silinen) |

**Yanıt biçimi:** `text/plain`, sekmeyle ayrılmış, tamamen ASCII (Türkçe
harfler katlanır: `Öztürk` → `Ozturk`). İlk satır sürüm başlığıdır
(`#ac2f-corel 1`); `#` ile başlayan satırlar atlanır. Hata yanıtları her
zamanki JSON gövdesidir.

```
# /corel/customers
id  klasör adı  görünen ad
e8a0…  ozturk-reklam-ltd-sti  Ozturk Reklam Ltd. Sti. (Ayse Yilmaz) 0555…

# /corel/materials?customerId=e8a0…
id  sahip  tür  kalınlık µm  marka  varyant  renk  en  boy  adet  görünen ad
0a65…  C  pleksi  5000  plexiglas    siyah  1220  2440  1  Pleksi 5mm Plexiglas Siyah 1220x2440 x1 [musterinin]
3bb3…  B  pleksi  2800  akpolimer  dokme  beyaz  1220  2440  3  Pleksi 2.8mm Akpolimer Dokme Beyaz 1220x2440 x3
```

- **`/corel/jobs`**: `{ id, quoteNo, createdAt, convertedAt, customerFolder, customerLabel, shopCode, materialSaleFolders, sheets: [{ purpose, ownerKind, owner, kind, thicknessUm, brand, variant, color, sheetWidthMm, sheetHeightMm, usedWidthMm, usedHeightMm, quantity, label }] }` dizisi. `sheetWidthMm/HeightMm` tabakanın dönüşümden önceki ölçüsüdür.
  - `purpose`: `cut` takım yolu klasörü, `sale` **malzeme satışı** (aynı tabakada işleme kalemi olmayan satış kalemi; runner `malzeme-F…` klasörü ve `m` dosyası açar). Aynı tabakada satış + işleme varsa tabaka bir kez, `cut` olarak gelir (satış kaleminin ölçüsü ve adediyle).
  - `ownerKind` / `owner`: malzemenin sahibi — `customer` (müşterinin klasör adı, en çok 20 harf) ya da `business` (dükkânın klasör kodu). Dönüşümde kaleme yazılır (`material_owner_kind/id`); eski kalemde satış kaleminin stok kaynağından ve plakanın stok seviyesinden bulunur. Runner klasör belirtecine (`F<gün>.<sahip>.<tür>-<renk>`) yazar.
  - Dükkânın klasör oluşturucusu kapalıysa liste boştur; malzeme satışına klasör kapalıysa `sale` kalemleri gelmez.
  - `/corel/quotes` tabaka sayısı ve `/corel/quotes/:id/usage` yalnız kesilen tabakaları (purpose `cut`) sayar.
- **Klasörler ne zaman açılır:** teklif **işe dönüştürülünce** (oluşturulunca
  değil). Teklif yanıtındaki `foldersCreatedAt`, `foldersPath`, `foldersHost`,
  `foldersNote` runner'ın bildirdiği sonucu, `foldersRequestedAt` son yeniden
  isteği taşır.
- **Renk jetonu** renk adı ve kodudur (`beyaz-1001`): aynı markada aynı adlı
  farklı kodlar ayrı takım yolu klasörüne gider.
- **Klasör adı:** firma adı varsa o, yoksa kişi adı; küçük harf ve
  boşluksuz, harf/rakam dışı her dizi tek `-` (`ozturk-reklam-ltd-sti`).
- **Jetonlar** (tür, marka, varyant, renk): küçük harf, harf/rakam dışı her
  dizi tek `-`. `--` eklentide alan grubu ayracıdır, jetonda geçmez.
- **Sahip:** `C` müşterinin konsinye stoğu (yalnız `customerId` verilince),
  `B` işletme stoğu. Yalnız tabaka (`area`) kalemler listelenir.
- **Arama** Türkçe harfe duyarsızdır ve her kelime geçmelidir:
  `dokme beyaz 2,8` → *Dökme*, *Beyaz*, *2.8mm*. Kalınlık `2800um`, ebat
  `1220x2440`, renk kodu ve stok kodu da aranır.

### Tekliften kullanılan tabaka ölçüsü

Teklif kesildikten sonra eklenti (`ac2fJobUsage`) teklifin tabaka
kalemlerini okur; bir tabakanın yalnız bir kısmı kullanıldıysa o
tabakanın takım yolu klasörüne `u135x100` adlı bir dosya koyar.

```
# /corel/quotes?customerId=e8a0…
id  teklif no  tarih  durum  tabaka kalemi
72cf…  TKF-2026-0001  2026-10-17  draft  2

# /corel/quotes/72cf…/usage   (malzeme satırıyla aynı düzen; en/boy KULLANILAN ölçü)
id  Q  tür  kalınlık µm  marka  varyant  renk  en  boy  adet  görünen ad
c1b4…  Q  pleksi  2800  akpolimer  dokme  beyaz  1000  1220  1  Pleksi 2.8mm Akpolimer Dokme Beyaz 1000x1220 x1
```

Yalnız plakalı ve m² ölçülen kalemler listelenir. Kalemde ölçü
girilmemişse plakanın ölçüsü yazılır, yani tabakanın tamamı kullanılmış
sayılır. Tarih UTC'dir; eklenti klasörü o günden geriye doğru arar.

---

## Süreyle fiyat ve kesim fiyatlandırması

İşleme kalemi (teklif ve işleme kaydı) artık **süreyle** de fiyatlanabilir:
`billingUnit: "time"` ve `durationMinutes`. Ölçü saattir, birim fiyat
**saatlik** ücrettir: `tutar = süre(dk) / 60 × birim fiyat`. Süre işin
toplamıdır, adetle çarpılmaz (adet işlenen plaka sayısıdır, stok içindir).

- **Asgari süre:** Ayarlar'daki "iş en az X dakikadan başlar" sunucuda
  uygulanır; kayda **faturalanan** süre yazılır (12 dk girilip asgari 30
  ise 30). Teklif → işleme dönüşümü bu süreyi taşır.
- **Kullanılan parça:** süreyle kalemde `widthMm`/`heightMm` tabakanın
  kullanılan parçasıdır; iş tamamlanınca stoktan o kadarı düşülür ve Corel
  `u…` dosyasını buna göre yazar. Verilmezse teklifte tabakanın ölçüsü yazılır.
- Süre **malzeme ölçüsü değildir**: tür/şablon/plaka ve satış kalemi
  `time` kabul etmez.

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/settings/cut-pricing` | 👥 | Saatlik ücret, asgari dk, m² ücreti, asgari m², makine hızları |
| PUT | `/settings/cut-pricing` | 👔 | Kısmi güncelleme |

```json
{ "hourlyRate": 1500, "minMinutes": 30, "areaRate": 450, "minArea": 0.5,
  "feedMmS": 25, "rapidMmS": 120, "plungeSec": 1.5, "passDepthMm": 3, "currency": "TRY" }
```

`/corel/pricing` aynı değerleri tek TSV satırı olarak verir (nokta ondalıklı):
`saatlik, asgari dk, m² ücreti, asgari m², kesim mm/sn, boşta mm/sn, dalma sn,
paso derinliği mm, para birimi`. Asgari m² yalnız Corel'in m² modülünde
uygulanır; teklifteki m² kalemleri değişmedi.

## Sabah özeti (Telegram)

Her sabah (varsayılan 08:00, Türkiye saati) Telegram'a: bekleyen işler
(makineye göre, süreyle işlerde dakika), henüz stoğu düşülmemiş işlerin
gerektirdiği plakalar ve stokta olup olmadığı, sipariş seviyesinin altına
düşen malzemeler, onaylanıp işe dönüşmemiş teklifler.

| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/settings/morning-summary` | 👔 | `{ enabled, cron }` |
| PUT | `/settings/morning-summary` | 👔 | `{ enabled }` |
| GET | `/notifications/morning-summary` | 👔 | Bugünkü özet metni (göndermeden) |
| POST | `/notifications/morning-summary/send` | 👔 | Şimdi gönder |

Zaman `MORNING_SUMMARY_CRON` (varsayılan `0 8 * * *`) ve
`MORNING_SUMMARY_TZ` (varsayılan `Europe/Istanbul`) ile değişir;
`SCHEDULER_ENABLED=false` iken zamanlı gönderim çalışmaz. Yalnız Telegram'a
gider (müşterilere WhatsApp gitmez).

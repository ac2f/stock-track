# API Uç Noktaları (Endpoints)

Tüm yanıtlar `TransformInterceptor` ile sarmalanır:

```json
{ "success": true, "data": <payload>, "timestamp": "2026-06-25T10:00:00.000Z" }
```

Kimlik doğrulama: `Authorization: Bearer <accessToken>` (login hariç tüm uçlar).

| Yetki gösterimi | Anlam |
| --------------- | ----- |
| 🔓 Public       | Token gerekmez |
| 👥 Auth         | Giriş yapmış herhangi bir kullanıcı |
| 👔 OWNER        | Sadece İşletme Sahibi |
| 🧑‍🔧 EMPLOYEE+   | Çalışan veya Sahip |

## Auth
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/auth/login` | 🔓 | `{ email, password }` → `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | 🔓 | `{ refreshToken }` → yeni access token |
| GET  | `/auth/me` | 👥 | Oturum sahibinin profili |

## Users (Personel)
| Metot | Yol | Yetki |
|-------|-----|-------|
| POST | `/users` | 👔 |
| GET | `/users` | 👔 |
| PATCH | `/users/:id` | 👔 |
| DELETE | `/users/:id` | 👔 |

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
| POST | `/material-colors` | 👔 | `{ name, code?, categoryId, isActive? }` — renk kodu seçilen kayıtla birlikte gelir |
| GET | `/material-colors` | 👥 | `?categoryId=` |
| PATCH | `/material-colors/:id` | 👔 | |
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

## Materials — Plakalar (Stok)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/plates` | 🧑‍🔧 | Şablondan plaka üret — `{ templateId, name?, sku?, variant?, widthMm?, heightMm?, ownerCustomerId?, addedAt?, processedAt?, quantityInStock?, warehouseId? }`. Marka/renk/ebat/kalınlık şablonun `default*Id` değerlerinden miras alınır. `widthMm/heightMm` bu fiziksel parçanın **kalan (kesilmiş) ebadıdır**; verilmezse standart tabaka ebadından alınır, verilirse standart ebadı **aşamaz** (`400`). `sku` boşsa `tür+marka+renk+kalınlık+tabaka ebatı`'ndan otomatik üretilir (gerekirse `-N` ekiyle benzersizleştirilir). `ownerCustomerId` verilirse açılış stoğu o müşterinin **konsinye** stoğu olarak yazılır; `addedAt` verilmezse bugün |
| GET | `/plates` | 👥 | Gelişmiş filtre: `?categoryId=&brand=&color=&search=&inStock=true&page=&limit=` |
| GET | `/plates/:id` | 👥 | Plaka + güncel piyasa fiyatları |
| PATCH | `/plates/:id` | 🧑‍🔧 | Kalan ebat, tarihler (`addedAt/processedAt`), ad, `sku`, `variant` güncellenir; kalan ebat türün standart tabaka ebadını aşamaz |
| POST | `/plates/:id/transfer-ownership` | 👔 | Sahipliği taraflar arasında serbestçe aktarır (işletme↔müşteri, müşteri↔müşteri) — `{ fromOwnerCustomerId?, toOwnerCustomerId?, warehouseId?, quantity? }`. Boş taraf işletmedir; miktar verilmezse kaynaktaki tümü |
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
| GET | `/customers/:id/payments` | 👥 | Ödeme geçmişi |
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
| GET | `/reports/stock-value?warehouseId=` | Stok değeri (depo + konsinye sahip kırılımı) |
| GET | `/reports/top-debtors`, `/reports/top-creditors` | En borçlu/alacaklı |

### Notifications (Bildirim — 👔 OWNER)
| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/notifications?limit=` | Gönderim defteri (Log + Telegram + WhatsApp) |
| GET | `/notifications/stats` | Defterin büyüklüğü (kayıt sayısı, en eski tarih) |
| DELETE | `/notifications?olderThanDays=` | Defteri temizler; parametresiz tümünü siler. İş verisi etkilenmez |
| POST | `/notifications/telegram/reload` | Telegram'ı "yeniden başlat": ayarları tazeler, jetonu `getMe` ile doğrular. Yanıt: `{ ok, botUsername, chatId, backupChatId, error? }` |
| POST | `/notifications/telegram/test` | Ayarlardaki sohbete deneme mesajı gönderir |

### Settings (Ayarlar — 👔 OWNER yazma)
| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/settings/business` | İşletme kimliği (belgelerde/portalda kullanılır) |
| PUT | `/settings/business` | İşletme kimliğini güncelle |
| GET | `/settings/telegram` | Telegram durumu. **Jeton maskeli döner**, asla açık değil. Mesajın gideceği sohbet kimlikleri burada |
| PUT | `/settings/telegram` | Jeton/sohbet kimliklerini güncelle. Alan gönderilmezse değişmez, **boş** gönderilirse temizlenir (`.env` değerine düşer) |

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
| POST | `/quotes` | 🧑‍🔧 | Karışık teklif (satış + işleme kalemleri); yalnızca hesap, cari/stok hareketi yok |
| GET | `/quotes`, `/quotes/:id` | 👥 | Filtre: `?status=&buyerCustomerId=&plateId=&from=&to=`. Karara bağlanmamış (taslak/gönderildi) teklifler daima en üstte; filtre yoksa son 1 hafta. Birim fiyat ölçü birimine göre uygulanır (m² malzemede tabaka kalan en×boy üzerinden) |
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

### Processing — Üretim Kuyruğu & Makineler
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/processing/queue` | 👥 | Aktif (pending/in_progress) işler, makineye göre gruplu; `?status=&machineId=` |
| PATCH | `/processing/:id/status` | 🧑‍🔧 | `{ status }` — COMPLETED: stok düşer + (ertelenmişse) cari DEBIT (idempotent); CANCELLED: iade |
| POST/PATCH/DELETE | `/machines(/:id)` | 👔 | Makine tanımları |
| GET | `/machines` | 👥 | |

`POST /processing` artık `billOnCompletion` (tamamlanınca faturala), `machineId`, `status` alır.

### Documents (PDF + Excel)
| Metot | Yol | Yetki | Tür |
|-------|-----|-------|-----|
| GET | `/sales/:id/pdf` | 🧑‍🔧 | PDF satış faturası |
| GET | `/processing/:id/pdf` | 🧑‍🔧 | PDF işleme fişi |
| GET | `/quotes/:id/pdf` | 🧑‍🔧 | PDF teklif |
| GET | `/customers/:id/statement.pdf` | 🧑‍🔧 | PDF cari ekstresi |
| GET | `/reports/{aging,profit-loss,stock-value}.xlsx` | 👔 | Excel rapor |
| GET | `/customers/:id/ledger.xlsx` | 👔 | Excel cari ekstre |

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
Her mesaj ve her düğme basışı, **işlenmeden önce** ayarlardaki yetkili kullanıcı
listesine (`Ayarlar › Telegram › Yetkili kullanıcılar`) karşı doğrulanır.
Liste boşken **hiç kimse** yetkili değildir. Yetkisiz kişiye yalnızca kendi
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

### Satış fiyatlandırması
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/settings/pricing` | 👥 | Genel kâr yüzdesi + konsinye komisyon oranı |
| PUT | `/settings/pricing` | 👔 | `{ saleMarkupPercent?, consignmentCommissionPercent? }` |
| GET | `/plates/:id/pricing` | 👥 | Satış fiyatı önerisi ve piyasa karşılaştırması |
| PUT | `/plates/:id/retail-price` | 🧑‍🔧 | `{ retailPrice, currency?, markupPercent? }` — perakende fiyatı girer/günceller |
| GET | `/plates/:id/retail-suggestions` | 👥 | Aynı türdeki (marka/renk farklı) fiyatı tanımlı malzemeler |

Perakende fiyat **TRY (varsayılan), USD veya EUR** girilebilir; `retailCurrency`
plakada saklanır. Hesaplar baz para biriminde yapılır — döviz, tanımlı kurdan
çevrilir. Kur tanımlı değilse `retailPriceBase` ve `suggestedUnitPrice` `null`
döner (fiyat elle girilir). Yanıt hem girilen değeri (`retailPrice` +
`retailCurrency`) hem çevrilmiş karşılığını (`retailPriceBase`) taşır.

`retail-suggestions`, fiyatı olmayan bir malzemeye aynı türdeki başka bir
malzemenin fiyatını uygulamak için kullanılır; aynı kalınlıktakiler
(`sameThickness`) listenin başında gelir.

Kural: **satış birim fiyatı = perakende fiyat × (1 + kâr%)**. Kâr yüzdesi
plakaya özel girilmişse (`markupPercent`) o, yoksa ayarlardaki genel oran
kullanılır. Perakende fiyat (`retailPrice`) plakada tutulur ve ölçü birimi
malzemenin ölçüm tipiyle aynıdır (m² / metre / adet).

Malzemeci (tedarikçi) fiyatlarıyla karşılaştırma yapılırken tabaka başına
girilen fiyatlar standart tabaka alanına bölünerek m² fiyatına çevrilir.
Bizim fiyatımız daha düşükse `discountPercent` döner ("piyasadan %X uygun");
piyasadan pahalıysak `null`. Bu oran teklif ekranında canlı gösterilir ve
satış anında cari ekstre açıklamasına da yazılır.


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

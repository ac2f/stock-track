# Veritabanı Şeması (Database Schema)

PostgreSQL + TypeORM. Tüm tablolar `BaseEntity`'den türer:
`id (uuid)`, `created_at`, `updated_at`, `deleted_at (soft-delete)`.

## Varlık-İlişki (ER) Diyagramı

```
                    ┌──────────────┐
                    │     User     │  (Personel — OWNER / EMPLOYEE)
                    └──────┬───────┘
            purchasedBy │  │ receivedBy (nakit tahsilat)
        ┌───────────────┘  └───────────────┐
        │                                  │
┌───────▼────────┐                 ┌───────▼────────┐
│ PurchaseOrder  │                 │    Payment     │
└───┬────────┬───┘                 └───┬────────┬───┘
   │        │                         │        │ bankAccountId (havale)
 supplierId vehicleId          customerId    ┌──▼──────────────┐
   │        │                         │      │  BankAccount    │
┌──▼─────┐ ┌▼────────┐         ┌──────▼─────┐└─────────────────┘
│Supplier│ │ Vehicle │         │  Customer  │
└──┬─────┘ └─────────┘         └──────┬─────┘
  │                                  │ 1
  │ supplierId                       │ *
┌──▼────────────────────┐    ┌────────▼───────────────┐
│ SupplierMaterialPrice │    │ CustomerLedgerEntry    │ (DEBIT / CREDIT defteri)
│ (piyasa fiyat takibi) │    └────────────────────────┘
└──┬────────────────────┘
  │ plateId
  │                ┌──────────────────┐         ┌──────────────────┐
┌──▼───────────────▼─┐  templateId    │ Material │                 │
│   MaterialPlate     │───────────────►│ Template │ (şablon/profil) │
│ (plaka / stok SKU)  │                └──────────┘                 │
└──┬──────────────────┘                                            │
  │ plateId                                                        │
┌──▼──────────────┐   processedBy   ┌──────────┐    ratePresetId  │
│  ProcessingJob  │────────────────►│   User   │   ┌──────────────▼─┐
│ (işleme + m²    │                 └──────────┘   │ ProcessingRate │
│  maliyet)       │─────────────────────────────► │ (m² birim fiyat│
└─────────────────┘   customerId → Customer        │  şablonu)      │
                                                   └────────────────┘
                  PurchaseOrder 1───* PurchaseOrderItem *───1 MaterialPlate
```

---

## Tablolar

### 1. `users` — Personel
| Alan          | Tip                | Açıklama                                  |
| ------------- | ------------------ | ----------------------------------------- |
| id            | uuid (PK)          |                                           |
| full_name     | varchar            | Ad soyad                                  |
| email         | varchar (unique)   | Giriş için                                |
| phone         | varchar (nullable) |                                           |
| password_hash | varchar            | bcrypt                                    |
| role          | enum `UserRole`    | `owner` \| `employee`                     |
| is_active     | boolean            | Pasif personel giriş yapamaz              |

### 2. `suppliers` — Tedarikçi
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| name | varchar | Firma adı |
| contact_name | varchar (nullable) | Yetkili |
| phone / email / address | varchar | İletişim |
| tax_number | varchar (nullable) | Vergi no |
| is_active | boolean | |

### 3. `vehicles` — Araç (satın almada kullanılan)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| plate_number | varchar (unique) | Plaka |
| name | varchar | "Beyaz Panelvan" vb. |
| type | varchar (nullable) | Kamyonet/Panelvan... |
| is_active | boolean | |

### 4. `bank_accounts` — Banka Hesabı (havale/EFT için)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| bank_name | varchar | Banka |
| account_name | varchar | Hesap sahibi |
| iban | varchar (unique) | IBAN |
| account_number | varchar (nullable) | |
| branch | varchar (nullable) | Şube |
| currency | varchar(3) | TRY/USD/EUR |
| is_active | boolean | |

### 4b. `material_categories` — Malzeme Türleri
> İşletme Sahibi'nin dilediği gibi ekleyip/düzenleyip/silebildiği dinamik tür
> tanımları (eski sabit kodlanmış `MaterialCategory` enum'unun yerini alır).
> Warehouse/Machine ile aynı basit desen.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| name | varchar | "Alüminyum" |
| code | varchar (unique) | "aluminum" — slug |
| default_measurement_type | enum `MeasurementType` | area/length/piece/weight — yeni şablonlara varsayılan |
| is_active | boolean | |

### 4c. Kategori Bazlı Kataloglar — `material_brands` / `material_colors` / `material_sizes` / `material_thicknesses`
> Marka/renk/ebat/kalınlık serbest metin değil, her kategoriye özel kataloglardır
> (kompozit kategorisinde pleksi markası seçilemez). Şablon/plaka silme-koruması
> ile aynı desen: kullanan şablon veya plaka varsa silme `409` döner.

**`material_brands`**

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| name | varchar | "Alupanel" |
| category_id | uuid (FK → material_categories) | |
| is_active | boolean | |

**`material_colors`**

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| name | varchar | "Beyaz" |
| code | varchar (nullable) | RAL / üretici kodu — seçilince renk adıyla birlikte gelir |
| category_id | uuid (FK → material_categories) | |
| is_active | boolean | |

**`material_sizes`**

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| width_mm | numeric | |
| height_mm | numeric | |
| category_id | uuid (FK → material_categories) | |
| is_active | boolean | |

**`material_thicknesses`**

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| value_mm | numeric | |
| category_id | uuid (FK → material_categories) | |
| is_active | boolean | |

### 5. `material_templates` — Malzeme Şablonu / Profil
> Aynı özellikleri tekrar tekrar yazmayı önler. Bir kez tanımlanır, plakalar
> bu şablondan üretilir. Marka/renk/ebat/kalınlık varsayılanları artık FK ile
> kategoriye özel kataloglara bağlanır (eager ilişki — API yanıtında kayıt
> nesnesiyle birlikte döner).

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| name | varchar | "Alüminyum Kompozit 3mm" |
| category_id | uuid (FK → material_categories) | Malzeme türü |
| default_brand_id | uuid (FK → material_brands, nullable) | Şablonun kategorisiyle eşleşmeli |
| default_color_id | uuid (FK → material_colors, nullable) | Şablonun kategorisiyle eşleşmeli |
| default_size_id | uuid (FK → material_sizes, nullable) | Şablonun kategorisiyle eşleşmeli |
| default_thickness_id | uuid (FK → material_thicknesses, nullable) | Şablonun kategorisiyle eşleşmeli |
| default_variant | varchar (nullable) | Kategori içi alt tür (örn. Pleksi'de "Dökme"/"Çekme") |
| default_attributes | jsonb | Türü genişleten serbest nitelikler |
| description | text (nullable) | |
| is_active | boolean | |

Aynı kategori + marka + renk + ebat + kalınlık + alt tür ile ikinci şablon
açılmaz (servis katmanında denetlenir; özelliksiz şablonda ad ayırt eder).

### 5b. `price_rules` / `price_rule_entries` — Fiyat Çatıları
> Bir grup malzemenin ortak referans fiyatı. Kapsam kategoriyle başlar, diğer
> alanlar boşsa "hepsi" demektir. Bir kaleme birden çok çatı uyarsa en özel
> olan geçerlidir. Aynı kapsamda ikinci çatı açılamaz.

`price_rules`

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| category_id | uuid (FK → material_categories) | Zorunlu |
| brand_id / thickness_id / color_id / size_id | uuid (FK, nullable) | Kategorinin kataloğundan; boş = hepsi. Ebat standart tabakadır |
| variant | varchar (nullable) | Alt tür (Dökme / Çekme), büyük/küçük harf fark etmez |
| unit | enum `per_plate` / `per_m2` / `per_meter` / `per_kg` | Çatıdaki bütün fiyatların birimi |
| markup_percent | numeric(6,2) (nullable) | Çatıya özel kâr; boşsa genel oran |
| reference_entry_id | uuid (nullable) | Referans seçilen fiyat; boşsa en ucuzu |
| note | text (nullable) | |
| is_active | boolean | Pasif çatı uygulanmaz |

`price_rule_entries`

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| rule_id | uuid (FK → price_rules, cascade) | |
| supplier_id | uuid (FK → suppliers, nullable) | Boşsa işletmenin kendi liste fiyatı; çatı başına malzemeci başına tek satır |
| price | numeric(14,2) | Çatının biriminde |
| currency | varchar(3) | TRY ya da döviz; hesapta son kurla baz para birimine çevrilir |
| price_updated_at | timestamptz | |
| note | varchar (nullable) | |

Katalog birleştirme (marka/renk/ebat/kalınlık/tür kopyaları) çatıların
referanslarını da korunan kayda taşır.

### 6. `material_plates` — Plaka (Stok SKU)
> `brand/color/color_code/width_mm/height_mm/thickness_mm` skaler kolonları
> hesaplama kodu (alan/m², işleme, teklif) tarafından doğrudan okunduğu için
> değişmeden kalır; oluşturma sırasında seçilen katalog kaydının değerleri bu
> kolonlara yazılır. `*_id` kolonları yalnızca form ön-doldurma ve kategori
> doğrulaması için eklenmiştir.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| template_id | uuid (FK → material_templates) | Profilden türer |
| name | varchar | Görünen ad |
| sku | varchar (unique, nullable) | Barkod/stok kodu |
| brand | varchar (nullable) | Seçilen `material_brands` kaydının adı |
| brand_id | uuid (FK → material_brands, nullable) | |
| color | varchar (nullable) | Seçilen `material_colors` kaydının adı |
| color_code | varchar (nullable) | Seçilen `material_colors` kaydının kodu |
| color_id | uuid (FK → material_colors, nullable) | |
| variant | varchar (nullable) | Şablondan miras, override edilebilir alt tür |
| width_mm | numeric | Bu parçanın **kalan (kesilmiş) eni**; verilmezse standart tabaka ebadından |
| height_mm | numeric | Bu parçanın **kalan (kesilmiş) boyu**; standart tabaka ebadını aşamaz |
| size_id | uuid (FK → material_sizes, nullable) | Standart tabaka ebadı (şablondan miras) |
| thickness_mm | numeric | Seçilen `material_thicknesses` kaydından |
| thickness_id | uuid (FK → material_thicknesses, nullable) | |
| attributes | jsonb | Özel nitelikler (doku, yüzey, baskı vb.) |
| quantity_in_stock | numeric | Mevcut adet (işletme stoğu toplamı) |
| reorder_level | numeric (nullable) | Kritik stok |
| added_at | date (nullable) | Edinme/stoğa giriş tarihi (elle ayarlanabilir, varsayılan bugün) |
| processed_at | date (nullable) | İşlenme (kesim/üretim) tarihi — proje dosyasını bulmaya yarar |
| is_active | boolean | |

> **Hesaplanan alan:** `area_m2 = (width_mm/1000) × (height_mm/1000)` —
> kalıcı tutulmaz, `area.util.ts` ile türetilir.

### 7. `supplier_material_prices` — Piyasa Fiyat Takibi
> Aynı plakanın farklı malzemecilerde kaça satıldığı + son güncelleme zamanı.
> Fiyat karşılaştırması bu tablodan yapılır.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| plate_id | uuid (FK → material_plates) | |
| supplier_id | uuid (FK → suppliers) | |
| price | numeric(14,2) | Birim fiyat |
| currency | varchar(3) | TRY/USD/EUR |
| unit | enum `PriceUnit` | per_plate \| per_m2 \| per_kg |
| price_updated_at | timestamptz | **Fiyatın en son güncellendiği an** |
| note | varchar (nullable) | |
| _UNIQUE_ | (plate_id, supplier_id, unit) | Tedarikçi başına tek güncel fiyat |

### 8. `purchase_orders` — Satın Alma
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| supplier_id | uuid (FK → suppliers) | Tedarikçi |
| purchased_by_id | uuid (FK → users) | **Satın almayı yapan personel** |
| vehicle_id | uuid (FK → vehicles, nullable) | **Kullanılan araç** |
| purchase_date | timestamptz | |
| total_amount | numeric(14,2) | Kalemlerden hesaplanır |
| currency | varchar(3) | |
| note | text (nullable) | |

### 9. `purchase_order_items` — Satın Alma Kalemi
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| purchase_order_id | uuid (FK) | |
| plate_id | uuid (FK → material_plates) | Stoğa girecek plaka |
| quantity | numeric | Adet |
| unit_price | numeric(14,2) | Birim alış fiyatı |
| line_total | numeric(14,2) | quantity × unit_price |

### 10. `processing_rates` — Metrekare Birim Fiyat Şablonu
> İşleme maliyetinin m² birim fiyatı. Sabit/ön ayarlı tutulur, işlem anında
> dinamik olarak ezilebilir.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| name | varchar | "Standart Kesim", "UV Baskı" |
| rate_per_m2 | numeric(14,2) | Varsayılan m² fiyatı |
| currency | varchar(3) | |
| is_default | boolean | Yeni işlemde ön seçili |
| is_active | boolean | |

### 11. `processing_jobs` — İşleme Kaydı
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| plate_id | uuid (FK → material_plates) | İşlenen plaka |
| customer_id | uuid (FK → customers, nullable) | Faturalanacak müşteri |
| processed_by_id | uuid (FK → users) | İşlemi yapan |
| rate_preset_id | uuid (FK → processing_rates, nullable) | Kullanılan şablon |
| processed_at | timestamptz | **İşlenme zaman damgası** |
| quantity | numeric | İşlenen adet |
| width_mm / height_mm | numeric | İşlenen ebat (plakadan kopyalanır, override edilebilir) |
| area_m2 | numeric(14,4) | (w/1000)×(h/1000)×quantity |
| rate_per_m2 | numeric(14,2) | **Etkin** m² fiyatı (şablon veya dinamik) |
| labor_cost | numeric(14,2) | area_m2 × rate_per_m2 |
| extra_cost | numeric(14,2) | Ek maliyet (nakliye vb.) |
| total_cost | numeric(14,2) | labor_cost + extra_cost |
| is_billed | boolean | Cariye borç olarak yansıdı mı |
| note | text (nullable) | |

### 12. `customers` — Müşteri (Cari)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| name | varchar | Ad / unvan |
| company_name | varchar (nullable) | |
| phone / email / address | varchar | |
| tax_number | varchar (nullable) | |
| opening_balance | numeric(14,2) | Açılış borcu |
| current_balance | numeric(14,2) | **Anlık borç (cache)** — ledger ile tutarlı |
| is_active | boolean | |

### 13. `customer_ledger_entries` — Cari Defteri (Hareketler)
> Borcun nasıl biriktiğinin tam geçmişi. Her hareket bir bakiye anlık görüntüsü
> (`balance_after`) taşır → geçmişe dönük izlenebilirlik.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| customer_id | uuid (FK → customers) | |
| entry_type | enum `LedgerEntryType` | `debit` (borç) \| `credit` (alacak/ödeme) |
| source_type | enum `LedgerSourceType` | opening, processing, payment, manual_adjustment |
| source_id | uuid (nullable) | İlgili kaydın id'si (ör. payment.id) |
| amount | numeric(14,2) | Hareket tutarı |
| balance_after | numeric(14,2) | **Hareket sonrası kalan borç** |
| description | varchar (nullable) | |
| occurred_at | timestamptz | |

### 14. `payments` — Ödeme
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| customer_id | uuid (FK → customers) | |
| amount | numeric(14,2) | **Ödeme miktarı** |
| payment_date | timestamptz | **Ödeme tarihi** |
| method | enum `PaymentMethod` | `cash` \| `bank_transfer` |
| received_by_id | uuid (FK → users, nullable) | **Nakitse: parayı teslim alan çalışan (zorunlu)** |
| bank_account_id | uuid (FK → bank_accounts, nullable) | **Havalede: hedef banka hesabı (zorunlu)** |
| reference_no | varchar (nullable) | Dekont / işlem no |
| balance_after | numeric(14,2) | **Ödeme sonrası kalan borç** |
| note | varchar (nullable) | |

> **İş kuralı (uygulama katmanında zorunlu):**
> - `method = cash`  → `received_by_id` **zorunlu**, `bank_account_id` boş.
> - `method = bank_transfer` → `bank_account_id` **zorunlu**, `received_by_id` boş.

---

## Cari Bakiye Mantığı

```
current_balance = opening_balance
                + Σ(ProcessingJob.base_total_cost for billed jobs)   // DEBIT
                + Σ(Sale.base_sale_total          for buyer)          // DEBIT
                - Σ(Sale.base_owner_amount        for material owner) // CREDIT
                - Σ(Payment.base_amount where direction=incoming)     // CREDIT
                + Σ(Payment.base_amount where direction=outgoing)     // DEBIT
```

- Tüm hareketler **baz para biriminde** (`DEFAULT_CURRENCY`) tutulur; yabancı para
  işlemler girişte çevrilir (`base_amount`/`base_total_cost`/`base_sale_total`).
- Pozitif bakiye = müşteri **borçlu**; negatif bakiye = işletme **borçlu** (malzeme sahibi alacaklı).
- `customers.current_balance` her harekette transaction içinde güncellenir;
  `CustomerLedgerEntry.balance_after` ile çapraz doğrulanabilir.

---

## v2 Genişletme (çoklu depo/döviz · genel malzeme · satış/konsinye · bildirim)

### Değişen tablolar
- **`material_templates`** → `measurement_type` (area/length/piece/weight) eklendi.
- **`material_plates`** → `measurement_type`, `unit_of_measure`; `width/height/thickness` **nullable**
  (rulo/şerit malzeme; yükseklik/malzeme `attributes` jsonb'da). `quantity_in_stock` artık işletme
  stoğunun **toplam cache**'idir.
- **`processing_rates`** → `unit` (area/length/piece) + `rate_per_unit` (eski `rate_per_m2`).
- **`processing_jobs`** → `billing_unit`, `quantity_value`, `rate_per_unit`, `length_m`,
  `currency/exchange_rate/base_total_cost`, `warehouse_id`.
- **`purchase_orders`** → `warehouse_id` (hedef depo).
- **`payments`** → `direction` (incoming/outgoing), `currency/exchange_rate/base_amount`.
- **`customers`** → `telegram_chat_id`.

### Yeni tablolar
| Tablo | Amaç / Önemli alanlar |
|-------|------------------------|
| `warehouses` | Depo/lokasyon: `name`, `code` (unique), `is_active`. |
| `stock_levels` | Depo + sahip bazlı stok: `plate_id`, `warehouse_id`, `owner_customer_id?` (NULL=işletme malı, dolu=konsinye), `quantity`. UNIQUE(plate, warehouse, owner). |
| `exchange_rates` | Döviz kuru: `base_currency`, `quote_currency`, `rate` (1 quote = rate × base), `as_of`, `source`. |
| `sales` | Satış: `buyer_customer_id`, `owner_customer_id?`, `sold_by_id`, `warehouse_id?`, `sale_total`, `owner_amount`, `business_margin`, `base_sale_total`, `base_owner_amount`, `currency`. |
| `sale_items` | Satış kalemi: `plate_id`, `quantity`, `unit_price`, `line_total`, `stock_source` (business/consignment_tracked/third_party_untracked), `owner_settlement` (manual_amount/commission_percent), `commission_percent?`, `owner_amount`. |
| `notifications` | Bildirim defteri: `type`, `channel` (log/telegram), `status`, `recipient?`, `subject?`, `body`, `error?`, `sent_at?`, `related_type/related_id`. |

### Satış cari mantığı
- Alıcı **DEBIT** `base_sale_total` (borçlanır).
- Üçüncü kişi sahibi **CREDIT** `base_owner_amount` (işletme sahibe borçlanır).
- İşletme kârı = `base_sale_total − base_owner_amount`.
- Sahibe ödeme: `payments.direction = outgoing` → sahibin alacağı **DEBIT** ile kapanır.

---

## v3 Genişletme (teklif/kuyruk · belge · portal · WhatsApp)

| Tablo / Kolon | Açıklama |
| ------------- | -------- |
| `quotes` | Teklif (proforma): `quote_no` (TKF-YYYY-NNNN, unique), `buyer_customer_id`, `owner_customer_id?`, `warehouse_id?`, `status` (draft/sent/accepted/rejected/expired/converted), `valid_until?`, `currency`+`exchange_rate`, `subtotal`/`total`/`base_total`, `converted_sale_id?`, `converted_at?`, `note?`; dükkân runner'ının bildirdiği klasör (`folders_created_at?`, `folders_path?`, `folders_host?`, `folders_note?`) ve arayüzden yeniden istek (`folders_requested_at?`). Cari/stok hareketi YOK. |
| `corel_runners` | Dükkân bilgisayarındaki runner'ın son durumu, bilgisayar başına bir satır (`shop_id`+`host` tekil): `version?`, `started_at?`, `last_seen_at`, `poll_seconds`, `day_root?`, `day_root_source?`, `last_error?`, `last_error_at?`, `last_job_quote_no?`, `last_job_at?`, `last_folder?`. |
| `quote_items` | Teklif kalemi: `quote_id` (CASCADE), `line_kind` (sale/processing), `plate_id`, `description?`, `quantity`, `unit_price`, `line_total`; işleme alanları (`billing_unit?`, `width_mm?`, `height_mm?`, `length_meters?`); dönüşüm anındaki tabaka ölçüsü (`sheet_width_mm?`, `sheet_height_mm?` — dönüşüm plakanın kalan boyunu düşürdüğü için, dükkân runner'ı klasör adına tam ölçüyü bununla yazar); satış alanları (`stock_source?`, `owner_settlement?`, `commission_percent?`, `owner_amount?`). |
| `machines` | Üretim makinesi: `name`, `code` (unique), `default_measurement_type`, `is_active`. |
| `processing_jobs` (+kolonlar) | `status` (pending/in_progress/completed/cancelled), `machine_id?`, `bill_on_completion`, `completed_at?`, `stock_consumed`. Ertelemeli işte stok+borç COMPLETED'da uygulanır (idempotent); CANCELLED iade eder. |
| `customers` (+kolon) | `portal_token?` (unique, NULL=erişim yok) — müşteri self-servis portalı için tahmin edilemez salt-okunur token. |

### Teklif → gerçek dönüşümü
- ACCEPTED teklif tek transaction'da çözülür: SALE kalemleri **tek** Satış kaydına (mevcut `SalesService`), PROCESSING kalemleri üretim kuyruğuna **PENDING** iş olarak (mevcut `ProcessingService`, `bill_on_completion=true`).
- Muhasebe/stok mantığı tekrar yazılmaz; teklif `converted` olarak kilitlenir.

### Belge & portal & WhatsApp
- **Belgeler** (PDF/Excel) yeni tablo gerektirmez; mevcut kayıtlardan üretilir (`documents` modülü, `pdfkit` + `exceljs`).
- **Portal** uçları `customers.portal_token` ile eşleşir; `@Public()` salt-okunur.
- **WhatsApp** kanalı (`notifications.channel = 'whatsapp'`) Meta Cloud API ile; alıcı = `customers.phone`. Config-gated.

## v4 Genişletme (çok dükkân · izinler · tekrar güvenli istekler)

| Tablo / Kolon | Açıklama |
| ------------- | -------- |
| `shops` | Dükkân: `name`, `is_active`. Silinmez; kapatılır. |
| `shop_members` | Üyelik: `shop_id`, `user_id` (ikisi birlikte unique), `is_admin`, `permissions` (jsonb: alan başına `{ read, write }`). Silme fizikseldir. Sistem sahibinin (`users.role = owner`) üyeliği gerekmez. |
| `system_settings` | Bütün sisteme ait tek satır: `telegram_bot_token`, `backup_telegram_chat_id`, `telegram_allowed_user_ids`. |
| `idempotency_keys` | İşlenmiş yazma istekleri: `key` (PK), `user_id`, `shop_id`, `method`, `path`, `state` (processing/done), `status_code`, `body` (json — yanıt aynen döner), `created_at`. `IDEMPOTENCY_TTL_DAYS` gün sonra silinir. |
| **her iş tablosu** (+kolon) | `shop_id` (uuid, indeksli): müşteri, ödeme, cari defter, stok, plaka, katalog, teklif, satış, iş, satın alma, gider, banka, bildirim, ayarlar (`app_settings` artık dükkân başına bir satır) ... Dükkândan bağımsız olanlar: `users`, `exchange_rates`, `shops`, `shop_members`, `system_settings`, `idempotency_keys`. |

### Tekillik dükkân başına
Eskiden tüm tabloda tekil olan alanlar artık `(shop_id, alan)` olarak tekildir:
`quotes.quote_no` (her dükkânın numarası TKF-YYYY-0001'den başlar),
`material_plates.sku`, `material_categories.code`, `machines.code`,
`warehouses.code`, `expense_categories.name`, `bank_accounts.iban`,
`vehicles.plate_number`. `customers.portal_token` tüm sistemde tekil kalır
(portal jetonu dükkânı belirler).

### Dükkân ayrımı nasıl sağlanır
- `shop_id` elle yazılmaz: kayıt eklenirken o anki dükkân bağlamından yazılır.
- Dükkâna bağlı tabloların her okuma/güncelleme/silme sorgusuna
  `shop_id = <dükkân>` koşulu TypeORM katmanında kendiliğinden eklenir
  (`common/shop/shop-scope.typeorm.ts`). Bağlam yoksa sorgu hata verir.
- Kayıt başka dükkânın kaydına bağlanamaz (ör. X dükkânının teklifine Y
  dükkânının müşterisi): ekleme/güncellemede dış anahtarların dükkânı
  denetlenir.
- Ham SQL bu süzgeçten geçmez; ham sorgularda koşul elle yazılır.

### Geçiş (ilk açılış)
`shop_id` sütunu boş geçilebilir eklenir (dolu tablolara eklenebilsin diye);
açılışta boş kalan her kayıt ilk dükkâna atanır, mevcut çalışanlar oraya
eklenir, Telegram bot/yedek ayarları `system_settings`'e taşınır
(`modules/shops/shop-migration.ts`, her açılışta çalışır, tekrarı zararsız).

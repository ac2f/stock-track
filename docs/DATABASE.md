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

### 5. `material_templates` — Malzeme Şablonu / Profil
> Aynı özellikleri tekrar tekrar yazmayı önler. Bir kez tanımlanır, plakalar
> bu şablondan üretilir.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| name | varchar | "Alüminyum Kompozit 3mm" |
| category | enum `MaterialCategory` | aluminum, aluminum_composite, plexiglass, dekota, mdf, forex, other |
| default_brand | varchar (nullable) | |
| default_thickness_mm | numeric (nullable) | |
| default_color | varchar (nullable) | |
| default_color_code | varchar (nullable) | RAL / üretici kodu |
| default_width_mm / default_height_mm | numeric (nullable) | Standart ebat |
| default_attributes | jsonb | Türü genişleten serbest nitelikler |
| description | text (nullable) | |
| is_active | boolean | |

### 6. `material_plates` — Plaka (Stok SKU)
| Alan | Tip | Açıklama |
|------|-----|----------|
| id | uuid (PK) | |
| template_id | uuid (FK → material_templates) | Profilden türer |
| name | varchar | Görünen ad |
| sku | varchar (unique, nullable) | Barkod/stok kodu |
| brand | varchar (nullable) | |
| color | varchar (nullable) | |
| color_code | varchar (nullable) | |
| width_mm | numeric | En |
| height_mm | numeric | Boy |
| thickness_mm | numeric | Kalınlık |
| attributes | jsonb | Özel nitelikler (doku, yüzey, baskı vb.) |
| quantity_in_stock | numeric | Mevcut adet |
| reorder_level | numeric (nullable) | Kritik stok |
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
                + Σ(ProcessingJob.total_cost  for billed jobs)   // DEBIT
                - Σ(Payment.amount)                              // CREDIT
```

- Her **işleme** (billed) → `customer_ledger_entries`'e bir **DEBIT** hareketi.
- Her **ödeme** → bir **CREDIT** hareketi + `payments.balance_after` güncellenir.
- `customers.current_balance` her harekette transaction içinde güncellenir;
  `CustomerLedgerEntry.balance_after` ile çapraz doğrulanabilir.

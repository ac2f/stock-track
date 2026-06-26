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

## Materials — Şablonlar
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/material-templates` | 👔 | Yeni şablon (alüminyum, kompozit...) |
| GET | `/material-templates` | 👥 | `?category=&search=` |
| PATCH | `/material-templates/:id` | 👔 | |

## Materials — Plakalar (Stok)
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/plates` | 🧑‍🔧 | Şablondan plaka üret (alanlar miras alınır) |
| GET | `/plates` | 👥 | Gelişmiş filtre: `?category=&brand=&color=&search=&inStock=true&page=&limit=` |
| GET | `/plates/:id` | 👥 | Plaka + güncel piyasa fiyatları |
| PATCH | `/plates/:id` | 🧑‍🔧 | |

## Materials — Piyasa Fiyatları
| Metot | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| PUT | `/plates/:plateId/prices` | 🧑‍🔧 | Tedarikçi fiyatını ekle/güncelle (zaman damgası otomatik) |
| GET | `/plates/:plateId/prices/compare` | 👥 | **Fiyat karşılaştırması** — en ucuzdan pahalıya, son güncelleme ile |

Örnek karşılaştırma yanıtı:
```json
{
  "plateId": "…",
  "cheapest": { "supplier": "Malzemeci A", "price": 1850.00, "updatedAt": "2026-06-20T09:12:00Z" },
  "prices": [
    { "supplier": "Malzemeci A", "price": 1850.00, "unit": "per_plate", "updatedAt": "2026-06-20T09:12:00Z" },
    { "supplier": "Malzemeci B", "price": 1920.00, "unit": "per_plate", "updatedAt": "2026-06-18T14:03:00Z" }
  ]
}
```

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
| POST | `/customers/:id/payments` | 🧑‍🔧 | Ödeme al (nakit→çalışan / havale→banka zorunlu) |
| GET | `/customers/:id/payments` | 👥 | Ödeme geçmişi |

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
| GET | `/notifications?limit=` | Gönderim defteri (Log + Telegram) |

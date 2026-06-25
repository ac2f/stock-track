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

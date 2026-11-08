# Uçtan uca denemeler

Gerçek API + PostgreSQL (+ Redis) ile çalışan betikler. Birim testlerin (`npm test`)
göremediği şeyleri sınar: sorgu katmanı, önbellek geçersiz kılma, çok işletmeli yalıtım.

Ön koşul: çalışan bir API ve tohum hesabı `owner@stocktrack.local` / `Owner123!`.

```bash
API=http://localhost:3000/api/v1 node test-e2e/platform.e2e.mjs   # kayıt, rehber, müşteri ağı
API=http://localhost:3000/api/v1 node test-e2e/cache.e2e.mjs      # Redis önbelleği (REDIS_URL gerekir)
API=http://localhost:3000/api/v1 node test-e2e/transfer.e2e.mjs   # işletmeler arası satış: onay/ret, geri alma, izleme
API=http://localhost:3000/api/v1 node test-e2e/trade.e2e.mjs      # yetkiler (süreli), "bende var", pazar yeri, tür önerisi, eşzamanlılık
API=http://localhost:3000/api/v1 node test-e2e/tenant-isolation.e2e.mjs  # işletmeler arası veri yalıtımı
API=http://localhost:3000/api/v1 node test-e2e/idor.e2e.mjs       # başka işletme kimlikleri, sahte JWT, yetki yükseltme denemeleri
API=http://localhost:3000/api/v1 node test-e2e/access-matrix.e2e.mjs  # her uç × kimlik (yönetici, çalışan, izinsiz, başka işletme, anonim) matrisi
```

`access-matrix` derlenmiş (`dist`) denetleyicileri tarar; her uç için koruma meta verisinden beklenen sonucu çıkarır
(izinsiz kimlik 401/403/404, başka işletme kimliği asla 2xx değil) ve 5xx'i hata sayar; yeni uç eklendiğinde
`npm run build` sonrası kendiliğinden kapsanır. `trade.e2e` yetkinin **süresinin dolmasını** sınamak için
`E2E_PSQL` (ör. `psql -h 127.0.0.1 -p 5433 -d stocktrack`) verildiğinde bitiş zamanını geriye çeker.

Betikler kendi verilerini oluşturur (etiketler, işletmeler, müşteriler) ve silmez; boş bir
veritabanında ya da geliştirme verisinde çalıştırın. `platform.e2e.mjs` kayıt ve giriş hız
sınırlarını bilerek aşar; art arda çalıştırırken sayaçları temizlemek için
`E2E_RATE_LIMIT_FLUSH` ortam değişkenine bir komut verin (dosyanın başındaki açıklamaya bakın).

# Uçtan uca denemeler

Gerçek API + PostgreSQL (+ Redis) ile çalışan betikler. Birim testlerin (`npm test`)
göremediği şeyleri sınar: sorgu katmanı, önbellek geçersiz kılma, çok işletmeli yalıtım.

Ön koşul: çalışan bir API ve tohum hesabı `owner@stocktrack.local` / `Owner123!`.

```bash
API=http://localhost:3000/api/v1 node test-e2e/platform.e2e.mjs   # kayıt, rehber, müşteri ağı
API=http://localhost:3000/api/v1 node test-e2e/cache.e2e.mjs      # Redis önbelleği (REDIS_URL gerekir)
API=http://localhost:3000/api/v1 node test-e2e/transfer.e2e.mjs   # dükkânlar arası satış / stok düşümü
```

Betikler kendi verilerini oluşturur (etiketler, işletmeler, müşteriler) ve silmez; boş bir
veritabanında ya da geliştirme verisinde çalıştırın. `platform.e2e.mjs` kayıt ve giriş hız
sınırlarını bilerek aşar; art arda çalıştırırken sayaçları temizlemek için
`E2E_RATE_LIMIT_FLUSH` ortam değişkenine bir komut verin (dosyanın başındaki açıklamaya bakın).

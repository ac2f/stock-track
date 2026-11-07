# Redis: önbellek ve istek sınırı

Redis **isteğe bağlıdır**: `REDIS_URL` boşsa süreç içi bellek kullanılır; Redis çökerse API
**çalışmaya devam eder** (okumalar PostgreSQL'e gider). Redis yalnız hız içindir — **gerçeğin
kaynağı hep PostgreSQL**'dir, Redis kaybolsa veri kaybı olmaz.

## Ne önbelleğe alınır

| Ne | Süre | Neden |
|---|---|---|
| Oturum doğrulaması (JWT'deki kullanıcı) | 5 dk | Her istekte 1 sorgu |
| Dükkân erişimi ve izinler | 5 dk | Her istekte 2 sorgu |
| Katalog listeleri (tür, marka, renk, ebat, kalınlık, şablon) | 10 dk | Her form açılışında |
| Dükkân ayarları, depolar | 5 dk | Her ekranda |
| Rapor/Dashboard, stok listesi, maliyet/fiyat | 15-30 sn | Ağır sorgular |
| Rehber, makine türü ağacı, il/ilçe, kayıt seçenekleri | 2-60 dk | Herkese ortak |

Yalnız **`@Cached`** işaretli GET uçları saklanır; yetki kontrolü (guard) önbellekten **önce** çalışır.
Yanıt başlığında `X-Cache: HIT|MISS` görünür.

## Tutarlılık: yeni/güncellenen veri önbellekte de güncellenir

Önbellek elle silinmez; **veritabanına yapılan her yazma** (save, `update()`, `increment()`,
`softDelete()` ve ham SQL — stok düşümü gibi) sorgu katmanında yakalanır ve etkilediği gruplar
**COMMIT'ten sonra** silinir (geri alınan işlemin yazmaları sayılmaz). Böylece:

- Satıştan sonra stok listesi, rapor, müşteri bakiyesi bir sonraki okumada **güncel** gelir;
- Üye çıkarılınca ya da izni değişince erişim **anında** değişir;
- Rehberden çıkan işletme **anında** kaybolur.

Yarış koruması: bir okuma veritabanından veri çekerken yazma olup grup silinirse, o eski sonuç
önbelleğe **yazılmaz** (silme bir "işaret" bırakır; Lua betiğiyle atomik denetlenir). Redis
kapalıyken yapılan değişiklikler hatırlanır; bağlantı gelince bütün önbellek temizlenir.
Uygulama dışından (elle `psql`) yapılan değişiklikleri yalnızca süre (TTL) sınırlar; gerekirse
**Platform › Kayıt ve sistem › Önbelleği temizle**.

Yapı: her (dükkân, grup) çifti Redis'te tek bir **hash**'tir; okuma tek gidiş-dönüş, grubu silmek
tek komut (anahtar taraması yok). Hangi tablo hangi grubu siler: `common/cache/cache.groups.ts`.
Yeni bir uç noktayı önbelleğe almak için `@Cached({ group, ttl })` ekleyin — uç nokta yalnız o
grubun kapsadığı tablolardan okumalıdır (`shop` grubu dükkânın her tablosunu kapsar).

## İstek sınırı

Giriş, kayıt ve telefon sorgusu Redis sayaçlarıyla sınırlanır (birden çok API kopyası aynı sayacı
paylaşır); aşılınca `429` + `Retry-After`. Sınırlar `@RateLimit(...)` ile uç noktada tanımlıdır.
API'nin önünde ters vekil varsa **`TRUST_PROXY_HOPS`**'u ayarlayın (yalnız API açık: 0; nginx→API: 1;
HAProxy→nginx→API: 2), yoksa tüm istemciler tek IP görünür.

## Kurulum

`docker-compose.prod.yml` bir **`redis`** servisi içerir: parolalı, **dışarıya port açılmaz**
(yalnız API konteyneri erişir), kalıcı değil (`--save "" --appendonly no`), bellek `REDIS_MAXMEMORY`
(varsayılan 256mb) ve dolunca en az kullanılan girdiler atılır (`allkeys-lru`). `install.sh` /
`install.ps1` parolayı kök `.env`'e (`REDIS_PASSWORD`) rastgele yazar ve korur. Elle kurulumda:

```bash
REDIS_URL=redis://:parola@127.0.0.1:6379/0
```

İzleme: `GET /health` (`cache`, `redis: up|down|n/a`) ve **Platform › Kayıt ve sistem › Önbellek**
(isabet oranı, otomatik silme sayısı, hata, Redis belleği). Kapatmak için `CACHE_ENABLED=false`.

## Ölçüm

Küçük veriyle yerel ölçüm (300 istek, ortalama): kategori listesi 5,0 → 2,7 ms, stok listesi
7,9 → 2,5 ms, dashboard 5,0 → 2,4 ms. Fark veri büyüdükçe artar: önbellekli yanıt süresi veri
miktarından bağımsızdır, sorgu süresi değildir.

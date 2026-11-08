# Kurulum & Çalıştırma (Dağıtım)

Bu belge; geliştirme, üretim, kalıcı veritabanı, yerel ağ erişimi ve ilk kurulum
adımlarını özetler.

## 0) Tek komutla otomatik kurulum (en kolay)

Tek ön koşul: **Docker** (Windows'ta Docker Desktop) kurulu ve çalışıyor olması.

- **Windows:** `install.bat` dosyasına **çift tıklayın**.
- **Linux / macOS:** depo kökünde `./install.sh` çalıştırın.

Script şunları otomatik yapar: `backend/.env` + kök `.env` üretir, güçlü JWT
secret'ları ve DB parolası atar, Postgres + API + Web servislerini derleyip
başlatır. İlk **OWNER** hesabı API açılışında otomatik oluşur. Bitince ekrana
erişim adresi ve giriş bilgileri yazılır.

> Mevcut bir `backend/.env` varsa script onu **korur** (parolanız/secret'larınız
> değişmez), yalnızca eksik kök `.env`'i yazar ve servisleri yeniden başlatır.
> Güncelleme: `git pull` ardından tekrar script.

Aşağıdaki bölümler, adımları elle yapmak isteyenler içindir.

### Sorun giderme: ".env'deki hesapla giriş yapılamıyor"

Genellikle nedeni, **eski bir veritabanı volume'ünün** yeni kurulumla parola/şema
uyuşmazlığıdır (örn. daha önce farklı bir parolayla kurulup volume silinmeden
yeniden kurulması). Belirti: giriş ekranı "ulaşılamıyor" ya da "parola hatalı"
der. Temiz başlangıç için (veritabanı SİLİNİR):

```bash
./install.sh --reset           # Windows: install.bat --reset
```

Script artık API hazır olana kadar bekler ve ilk hesabı görünür biçimde
(idempotent) oluşturur; sorun varsa son API kayıtlarını ekrana basar.

### Sorun giderme: derleme sırasında "npm error network"

Kurulum `npm ci` adımında "In most cases you are behind a proxy or have bad
network settings" ile düşüyorsa Docker'ın içinden internete (npm kayıt
sunucusuna) ulaşılamıyordur; kodla ilgili değildir. Sık nedenler: Docker
Desktop'ın DNS'i, VPN/proxy, antivirüs güvenlik duvarı, Wi-Fi.

Kurulum scriptleri bunu kendileri karşılar: imajları sırayla derler, başarısız
olursa 3 kez dener (indirilenler önbellekte kalır, kaldığı yerden devam eder),
yine olmazsa Docker içinden erişimi ölçüp ne yapılacağını yazar. Elle düzeltmek
için sırayla:

1. Docker Desktop › Settings › **Docker Engine**; JSON'a şunu ekleyin
   (virgüle dikkat), **Apply & restart**:
   ```json
   "dns": ["8.8.8.8", "1.1.1.1"]
   ```
2. VPN, proxy ya da antivirüs güvenlik duvarını kapatıp deneyin. Kurumsal proxy
   varsa Docker Desktop › Settings › Resources › **Proxies**.
3. Kablolu bağlantı deneyin; sonra `install.bat` dosyasını yeniden çalıştırın.

## 1) Geliştirme (sadece veritabanı Docker'da)

```bash
# Postgres'i ayağa kaldır (kalıcı volume ile)
docker compose up -d postgres

# Backend
cd backend
cp .env.example .env          # değerleri düzenleyin
npm install
npm run seed                  # ilk kurulum: OWNER + varsayılanlar (yalnızca bir kez)
npm run start:dev             # http://localhost:3000/api

# Frontend (ayrı terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

## 2) Üretim (her şey Docker'da)

```bash
cp backend/.env.example backend/.env
#  → JWT_ACCESS_SECRET / JWT_REFRESH_SECRET: en az 32 karakter, rastgele, birbirinden farklı (aksi hâlde API açılmaz)
#  → DB_PASSWORD: güçlü parola
#  → DB_SYNCHRONIZE=true  (migration tanımlı olmadığından şema otomatik kurulur)

# Derle ve başlat (Postgres + API + Web)
docker compose -f docker-compose.prod.yml up -d --build
```

> **İlk kurulum hesabı otomatik oluşur.** API açılışında (şema hazır olduğunda)
> idempotent tohumlama çalışır: OWNER kullanıcısı + varsayılan tarife/depo/türler.
> Yani ayrıca bir seed komutu çalıştırmanıza gerek yoktur. Giriş bilgileri
> `backend/.env` içindeki `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` değerleridir.
> `install.sh` / `install.ps1` parolayı **rastgele üretir** ve kurulum sonunda gösterir;
> herkesin bildiği örnek parola (`Owner123!`) yalnız geliştirmede kullanılır — üretimde
> (`NODE_ENV=production`) parola verilmediyse ya da örnek bırakıldıysa API rastgele bir parola
> üretip yalnız ilk oluşturmada günlüğe **bir kez** yazar. Eski bir kurulumda hesap hâlâ örnek
> parolayla duruyorsa açılışta uyarı verilir: giriş yapıp parolayı değiştirin. Bu davranışı
> kapatmak için `SEED_ON_BOOT=false` ayarlayın. Üretimde Swagger (`/api/docs`) kapalıdır;
> gerekirse `SWAGGER_ENABLED=true`. İsterseniz elle de çalıştırabilirsiniz:
>
> ```bash
> docker compose -f docker-compose.prod.yml run --rm api node dist/database/seed.js
> ```

Erişim:

- **Web (arayüz):** `http://<sunucu-ip>/`
- **API:** `http://<sunucu-ip>:3000/api`  ·  Swagger: `…/api/docs`

Durdurma / güncelleme:

```bash
docker compose -f docker-compose.prod.yml down            # durdur (veri korunur)
docker compose -f docker-compose.prod.yml up -d --build   # yeniden derle/başlat
```

> ⚠️ `down -v` veritabanı volume'ünü de siler — verileri kaybetmemek için kullanmayın.

### Üretim kontrol listesi

Canlıya almadan önce:

| Konu | Ne yapılmalı / ne olur |
| ---- | ---------------------- |
| **Sırlar** | `JWT_ACCESS_SECRET` ve `JWT_REFRESH_SECRET`: en az 32 karakter, örnek olmayan, **birbirinden farklı** rastgele değerler (`openssl rand -hex 32`). `NODE_ENV=production`'da zayıf/örnek sır varsa API **açılmaz** ve nedenini yazar. `install.sh` / `install.ps1` bunları kendisi üretir. |
| **Parolalar** | `DB_PASSWORD`, `REDIS_PASSWORD` (kök `.env`) ve sistem sahibi parolası (`SEED_OWNER_PASSWORD`) güçlü olmalı. Postgres ve Redis dışarıya **açılmaz**; yalnız compose ağında erişilir. |
| **HTTPS** | Arayüzü internete açacaksanız önüne TLS sonlandıran bir ters vekil (Caddy, Traefik, HAProxy, bulut yük dengeleyici) koyun ve `X-Forwarded-Proto: https` iletin; nginx bu durumda HSTS başlığını kendiliğinden ekler. Vekil sayısına göre `TRUST_PROXY_HOPS` ayarlayın (nginx→api için 1, vekil→nginx→api için 2): gerçek istemci IP'si hız sınırı ve kayıtlarda buna bağlıdır. |
| **API portu** | Compose, API'yi `:3000`'de de yayınlar (yerel sunucu/Corel/Runner doğrudan buraya bağlanır). Yalnız arayüz üzerinden kullanıyorsanız `ports:` satırını silin ya da `127.0.0.1:3000:3000` yapın; internete açıksa güvenlik duvarıyla kısıtlayın. |
| **CORS** | Arayüz ve API aynı kaynaktan (nginx `/api`) sunulduğunda gerekmez. `APP_CORS_ORIGIN=*` açılışta uyarı verir; arayüz adresine kısıtlayın. |
| **Güvenlik başlıkları** | nginx şunları ekler: `Content-Security-Policy` (betik yalnız aynı kaynaktan), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; `server_tokens off`. API ayrı bir adresteyse `frontend/security-headers.conf` içindeki `connect-src`'e o adresi ekleyin. |
| **Konteynerler** | API **root olmayan** kullanıcıyla çalışır (giriş betiği yedek birimini düzeltip yetkiyi düşürür), `tini` ile sinyalleri doğru alır; `docker stop` → SIGTERM → süren istekler biter, veritabanı/Redis bağlantıları kapanır (`stop_grace_period: 30s`). Hem API hem web için `HEALTHCHECK` vardır (`docker ps` → `healthy`). |
| **Veritabanı havuzu** | Varsayılanlar: 20 bağlantı, bağlantı bekleme 10 sn, sorgu üst süresi 120 sn, açık kalıp boşta bekleyen işlem 120 sn. Ayar: `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `DB_IDLE_TX_TIMEOUT_MS` (`0` = kapalı). Postgres'in `max_connections` değeri (varsayılan 100) API sayısı × `DB_POOL_MAX`'ı karşılamalı. |
| **Şema** | `DB_SYNCHRONIZE=true`: şema açılışta kodla eşitlenir (henüz migration yoktur). Yükseltmede veri varsa **önce tam yedek** alınır (`PRE_UPGRADE_BACKUP=auto`; `required` yedek alınamazsa açılmaz). Sürüm notlarında "indeks/kolon kaldırıldı" geçiyorsa yedeği doğrulayın. PM2 cluster'da ilk açılışı **tek süreçle** yapın (bkz. `ecosystem.config.js`). |
| **Yedek** | Günlük otomatik yedek `api_backups` volume'ündedir; şifre çözme anahtarı da burada. Volume'ü ve anahtarı ayrıca saklayın, **geri yüklemeyi bir kez deneyin** (Ayarlar › Yedekleme). |
| **Oturumlar** | Parola değişince (ya da hesap pasife alınınca) o hesabın eski access/refresh oturumları hemen geçersiz olur. Girişte hesap yoksa da aynı sürede aynı hata döner (hesap sızdırmaz). |
| **Günlükler** | Konteyner günlükleri 3 × 10 MB ile sınırlıdır. Üretimde yalnız `log/warn/error` yazılır. Beklenmeyen hata (`[uncaughtException]`) sürecin kapanıp yeniden başlamasına yol açar; açılış başarısız olursa süreç `[açılış başarısız]` yazıp 1 koduyla çıkar. |
| **Sürekli tümleştirme** | `.github/workflows/ci.yml`: her push'ta derleme, `eslint`, birim testler, `npm audit` (yüksek/kritik açık derlemeyi kırar) ve gerçek PostgreSQL + Redis ile uçtan uca denemeler (yalıtım, yetki, ticaret, eşzamanlılık, oturum). |

**Bilinen bağımlılık uyarıları (orta düzey, kabul edilen).** `npm audit --omit=dev` aşağıdakileri raporlar; hepsinin kapanması NestJS'in iki majör sürüm atlamasını (10 → 12) gerektirir ve ilgili özellikler kullanılmaz ya da yalnız kimliği doğrulanmış sistem sahibi tarafından erişilir:
`@nestjs/core` (SSE/başlık enjeksiyonu — SSE kullanılmıyor), `multer` (yalnız sistem sahibinin yedek yükleme ucu), `file-type` (dosya doğrulama borusu kullanılmıyor), `glob`/`minimatch` (yalnız yapılandırmadaki sabit varlık desenleri), `uuid` (`buf` argümanı verilmiyor), `exceljs`. Yüksek/kritik düzeyler giderildi (`bcrypt` 6, `lodash`, `js-yaml`, `qs`, `body-parser` yamalı sürümleri `package.json › overrides`). Arayüzde `react-router` için açık yönlendirme uyarısı vardır; uygulama kullanıcıdan gelen bir adrese yönlendirme yapmadığı için etkilenmez.

## 3) Kalıcı veritabanı volume'ü

Veritabanı, `pgdata` adlı **kalıcı** Docker volume'ünde tutulur; container'lar
silinse bile veriler korunur.

**Windows'ta belirli bir klasörü** veritabanı dizini yapmak için
`docker-compose.yml` içindeki `postgres > volumes` bölümünde verilen yorumlu
örneği açın, örn:

```yaml
volumes:
  - 'C:/stocktrack/pgdata:/var/lib/postgresql/data'
```

(Docker Desktop > Settings > Resources > File Sharing içinde sürücü paylaşıma
açık olmalı; klasör önceden var olmalı.)

## 3b) Eski sürümden yükseltme (veri kaybı olmadan, otomatik)

Çok işletmeli (kiralama) sürüme geçerken mevcut veriler **kendiliğinden** taşınır;
elle bir şey çalıştırmanız gerekmez:

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

API açılırken sırayla şunlar olur:

1. Eski şema algılanırsa **önce tam yedek** alınır (`pg_dump`, tek dosya):
   `pre-upgrade-<veritabani>-<tarih>.sql`. Bu dosya `api_backups` adlı kalıcı
   volume'de (konteyner içinde `/app/backups`) durur; konteyner yeniden
   oluşturulsa bile silinmez. Yedek yalnız yükseltmenin ilk açılışında alınır.
2. Şema yalnızca **ekleme** yapar (yeni tablo/sütun); eski tablo ve sütunlara
   dokunulmaz.
3. Bütün eski kayıtlar (müşteri, stok, teklif, cari, çalışan ...) otomatik
   olarak **ilk işletmenize** bağlanır; çalışanlar o işletmeye eski
   yetkileriyle eklenir. İşletme adı/telefon/adres, eski *Ayarlar*'daki
   işletme bilgilerinden doldurulur (bir kez; sonradan boşalttığınız alan geri
   doldurulmaz).
4. İlk işletme `aktif` ve süresizdir. Dizinde görünmez, ağ paylaşımı kapalıdır:
   *İşletme Profili*'nden il/ilçeyi girip anahtarları kendiniz açarsınız.

Yedek davranışı `PRE_UPGRADE_BACKUP` ile seçilir:

| Değer | Anlamı |
|---|---|
| `auto` (varsayılan) | Yedek alınmaya çalışılır; alınamazsa uyarı yazılır ve açılış sürer. |
| `required` | Yedek alınamazsa API **açılmaz** ve veritabanına dokunulmaz. |
| `off` | Yedek alınmaz. |

Yedek klasörü `BACKUP_DIR`, `pg_dump` konumu `BACKUP_PG_BIN_DIR` ile verilir.
Kritik veride ilk yükseltmeyi `PRE_UPGRADE_BACKUP=required` ile yapmanız önerilir.

**Eski konteynerin yedekleri:** `api_backups` volume'ü ilk kez bağlanırken
eski konteynerin `/app/backups` içeriği (otomatik gece yedekleri ve şifre
anahtarları) görünmez olur. `up -d --build` öncesinde kopyalayın:

```bash
docker cp stocktrack-api:/app/backups ./backups-eski
```

**Geri dönmek** gerekirse (yedek yükseltmeden hemen önceki hâldir):

```bash
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U stocktrack -d stocktrack < pre-upgrade-stocktrack-<tarih>.sql
```

> Eski sürümün kodunu yeni şemalı veritabanında doğrudan çalıştırmayın: eski
> sürüm açılışta yeni sütunları siler. Geri dönüşte mutlaka yukarıdaki yedeği
> yükleyin.

## 4) Yerel ağ (LAN) erişimi

Üretimde **arayüz ve API aynı origin'den** sunulur: nginx (port 80) hem arayüzü
verir hem de `/api/...` isteklerini backend konteynerine (api:3000) **proxy'ler**.
Bu sayede port/CORS ayarı GEREKMEZ ve her cihaz tek adresle çalışır.

- Aynı ağdaki telefon/tablet/bilgisayar yalnızca şununla bağlanır:
  - **Arayüz + API: `http://<sunucu-ip>/`** (örn. `http://192.168.1.50/`)
- Yalnızca **80** portunu (web) güvenlik duvarında açmanız yeterlidir.
  (API ayrıca `:3000`'de doğrudan erişilebilir — Swagger/hata ayıklama için
  opsiyonel; arayüz bunu kullanmaz.)
- Geliştirmede (vite dev) arayüz `:5173`, backend `:3000`'dedir; arayüz dev'de
  otomatik `localhost:3000` API'sini kullanır.
- Farklı bir API adresi şart ise derlemede `VITE_API_URL` verebilirsiniz, ama
  normal kurulumda gerekmez.

## 5) İşletme/proje kimliği (ad, adres, logo)

Belgelerde (PDF/yazdırma) ve arayüz başlığında görünen ad **Ayarlar** ekranından
düzenlenir — yeniden derleme gerektirmez. Her dükkânın kendi adı ve bilgileri
vardır (aşağıya bakın).

## 6) Uzak sunucu (internet) ve HTTPS

API'yi dükkândaki bilgisayardan bir sunucuya (VPS) taşırken aynı Docker
kurulumu kullanılır; yalnız önüne HTTPS eklenir:

```bash
# Sunucuda (alan adının DNS kaydı sunucuyu göstermeli; 80 ve 443 açık)
git clone … && cd stock-track && ./install.sh        # ilk kurulum (.env üretir)
DOMAIN=stok.ornek.com docker compose \
  -f docker-compose.prod.yml -f docker-compose.remote.yml up -d --build
```

- Güncelleme: `git pull`, ardından yukarıdaki `DOMAIN=… docker compose …`
  komutunun aynısı (`install.sh` API'yi yerelde 3000'den açar ve HTTPS
  ekini kullanmaz; ilk kurulumdan sonra uzak sunucuda bu komutu kullanın).
- Arayüz: `https://stok.ornek.com/` — telefon, tablet, dükkândaki bilgisayar
  hepsi aynı adresi kullanır.
- Corel eklentisinin sunucu adresi: `https://stok.ornek.com/api/v1`.
- `docker-compose.remote.yml` Caddy ekler: sertifikayı kendisi alır ve
  yeniler; API (3000) ve web (80) doğrudan dışarı açılmaz.
- HTTPS şarttır: hem oturum anahtarı internette açık gitmesin, hem de
  arayüzün çevrimdışı kabuğu (service worker) tarayıcıda yalnız HTTPS'te
  çalışır.
- Yedekleri sunucu dışında tutun (Ayarlar › Yedek: şifreli yedek Telegram'a
  gider).

### Redis, istek sınırı ve ters vekil

`docker-compose.prod.yml` bir **Redis** servisi içerir (parolalı, dışarıya port açmaz; bkz.
[REDIS.md](REDIS.md)). Parola kök `.env`'dedir (`REDIS_PASSWORD`; `install.sh` üretir). Redis olmadan
da çalışır, ama önbellek ve istek sınırı süreçler arasında paylaşılmaz.

API'nin önünde ters vekil varsa gerçek istemci IP'si için `backend/.env`'e **`TRUST_PROXY_HOPS`**
yazın: yalnız API açık → `0`; nginx(web) → API → `1` (varsayılan); HAProxy → nginx → API → `2`.
Yanlış değer istek sınırını bozar (herkes tek IP görünür).

Sistemi **birden çok işletmeye kiralayacaksanız** [PLATFORM.md](PLATFORM.md)'ye bakın: `/register`
herkese açıktır; kayıt kuralları (açık/kapalı, onay, deneme süresi) Platform ekranından yönetilir.
İnternete açık kurulumda HTTPS şarttır.

## 7) Bağlantı kesilince (çevrimdışı çalışma)

Sunucu yeniden başlarken, internet koptuğunda ya da veritabanı kısa süre
kapandığında arayüz durmaz:

- Sayfa yine açılır (son yüklenen sürüm tarayıcıda saklıdır).
- Ekranlar son görülen verilerle açılır; başlıkta sarı **Çevrimdışı** şeridi
  görünür.
- Yeni müşteri, tahsilat, teklif, satış, iş kaydı, gider, satın alma ve stok
  girişi **bu cihazda sıraya alınır**. Silme, dönüştürme, ayar ve ekip
  işlemleri bağlantı ister.
- Bağlantı gelince sıradakiler kendiliğinden, sırasıyla ve her biri yalnız
  bir kez gönderilir; ekranlar tazelenir, cihazdaki kuyruk ve eski kopyalar
  silinir. Sunucunun kabul etmediği bir işlem (ör. stok yetmedi) şeritte
  kırmızıyla görünür: düzeltip **Yeniden dene** ya da **Sil**.
- Sıra cihaza ve oturum açan kişiye aittir: başka bir bilgisayarda
  görünmez; aynı kişi yeniden giriş yapınca gönderilir.

Corel eklentisi de StockTrack'ten aldığı son listeleri bilgisayarda saklar;
sunucu yokken müşteri bağlama ve plaka seçme bu listelerle sürer.

### Dükkânda yerel sunucu (uzun kesintiler için)

Tarayıcının sırası tek cihaza aittir ve kesinti uzarsa stok/cari gibi
hesaplar sunucuya ulaşana kadar yapılmaz. Merkez uzaktaysa (internet) ya da
kesintiler uzun sürüyorsa dükkâna **yerel sunucu** kurun:

1. Merkezde **Ayarlar › Yerel sunucular** → ad + dükkânlar → *Anahtar üret*
   (anahtar bir kez gösterilir).
2. Dükkân bilgisayarında `backend/.env.replica` hazırlayın (JWT anahtarları
   merkezinkinden farklı) ve `docker compose -f docker-compose.replica.yml up -d --build`.
3. Eşitleme ajanını `UPSTREAM_URL=https://<merkez>/api/v1` ve
   `REPLICA_TOKEN=str_…` ile başlatın. İlk yükleme bitince giriş ekranında
   "yerel sunucuya bağlanıyorsunuz" yazar.
4. Dükkândaki cihazlar `http://<pc-ip>/` adresini kullanır. Corel: iş menüsü
   7 → `5=<pc-ip>`; runner `config.json` → `fallback_server` (boşsa Corel'in
   ayarı).

Ortam değişkenleri: `SYNC_ROLE` (`primary`/`replica`), `SYNC_RETENTION_DAYS`
(merkezde günlük süresi, 30), `SYNC_GAP_WAIT_SECONDS` (60). Ayrıntı ve
kurallar: [`SYNC.md`](SYNC.md).

## 8) Dükkânlar ve yetkiler

- İlk açılışta mevcut veriler otomatik olarak **ilk dükkâna** taşınır (adı
  işletme adınız); hiçbir veri kaybolmaz. Mevcut çalışanlar oraya eski
  erişimleriyle eklenir.
- Yeni dükkân: *Ekip › + Yeni dükkân* (yalnız sistem sahibi). İsterseniz
  kataloğu ve ayarları mevcut bir dükkândan kopyalar; stok, müşteri, teklif
  ve ödemeler her dükkânda ayrıdır.
- Kim hangi dükkânda neyi görür (okuma) ve değiştirir (yazma): *Ekip*
  ekranındaki izin tablosu. Dükkân yöneticisi kendi dükkânının ekibini,
  kendisinde olan izinler kadarıyla düzenler.
- Corel eklentisi: her dükkânın *Ayarlar › Corel entegrasyonu*'ndan kendi
  anahtarı üretilir; eklentiye hangi anahtar yapıştırılırsa o dükkânın
  listeleri gelir.
- Telegram: tek bot bütün dükkânlara hizmet eder; her dükkânın bildirim
  sohbeti ayrıdır (*Ayarlar › Telegram*). Botta yetkili kişiler ana menüdeki
  dükkân düğmesiyle dükkân değiştirir.

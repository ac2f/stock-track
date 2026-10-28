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
#  → JWT_ACCESS_SECRET / JWT_REFRESH_SECRET: güçlü, rastgele değerler
#  → DB_PASSWORD: güçlü parola
#  → DB_SYNCHRONIZE=true  (migration tanımlı olmadığından şema otomatik kurulur)

# Derle ve başlat (Postgres + API + Web)
docker compose -f docker-compose.prod.yml up -d --build
```

> **İlk kurulum hesabı otomatik oluşur.** API açılışında (şema hazır olduğunda)
> idempotent tohumlama çalışır: OWNER kullanıcısı + varsayılan tarife/depo/türler.
> Yani ayrıca bir seed komutu çalıştırmanıza gerek yoktur. Giriş bilgileri
> `backend/.env` içindeki `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` değerleridir
> (varsayılan: `owner@stocktrack.local` / `Owner123!`). Bu davranışı kapatmak için
> `SEED_ON_BOOT=false` ayarlayın. İsterseniz elle de çalıştırabilirsiniz:
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

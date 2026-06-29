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
(yalnızca İşletme Sahibi) düzenlenir — yeniden derleme gerektirmez.

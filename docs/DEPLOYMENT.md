# Kurulum & Çalıştırma (Dağıtım)

Bu belge; geliştirme, üretim, kalıcı veritabanı, yerel ağ erişimi ve ilk kurulum
adımlarını özetler.

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

# İlk kurulum tohumlaması (yalnızca BİR kez): OWNER kullanıcısı + varsayılanlar
docker compose -f docker-compose.prod.yml run --rm api node dist/database/seed.js
```

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

- Backend tüm arayüzlerden dinler (`0.0.0.0`), CORS varsayılanı `*`'tır.
- Aynı ağdaki telefon/tablet/bilgisayar, sunucunun IP'siyle bağlanır:
  - Arayüz: `http://192.168.x.x/` (üretim) veya `http://192.168.x.x:5173/` (dev)
  - Arayüz, API adresini **otomatik** olarak aynı host'un `:3000` portu varsayar
    (`VITE_API_URL` tanımlı değilse). Yani ayrı yapılandırma gerekmez.
- Sabit bir API adresi gerekiyorsa derlemede `VITE_API_URL` verin:
  ```bash
  VITE_API_URL=http://192.168.1.50:3000/api/v1 \
    docker compose -f docker-compose.prod.yml up -d --build web
  ```
- Sunucunun güvenlik duvarında 80 (web) ve 3000 (API) portlarına izin verin.

## 5) İşletme/proje kimliği (ad, adres, logo)

Belgelerde (PDF/yazdırma) ve arayüz başlığında görünen ad **Ayarlar** ekranından
(yalnızca İşletme Sahibi) düzenlenir — yeniden derleme gerektirmez.

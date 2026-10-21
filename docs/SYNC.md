# Merkez ↔ Yerel Sunucu Eşitlemesi

İnternet kesildiğinde ya da merkez sunucu çöktüğünde dükkânda çalışma
durmasın diye: dükkândaki bir bilgisayarda **yerel sunucu** (replika) çalışır,
arayüz ve Corel eklentisi ona bağlanır. Yanındaki **eşitleme ajanı**
bağlantı gelince yerelde yapılan işlemleri merkeze gönderir, merkezdeki
değişiklikleri yerele indirir.

Bu belge sözleşmenin tamamıdır: merkez sunucunun sağladığı uçlar, yerel
sunucunun davranışı, ajanın uyması gereken kurallar. Ajanın kendisi ayrı bir
programdır (bkz. [`SYNC_AGENT_MASTER_PROMPT.md`](SYNC_AGENT_MASTER_PROMPT.md)).

```
        İnternet / WAN                              Dükkân (LAN)
 ┌──────────────────────────┐        ┌───────────────────────────────────────────┐
 │ MERKEZ (SYNC_ROLE=primary)│        │ YEREL SUNUCU (SYNC_ROLE=replica)          │
 │  NestJS API + Postgres    │◄──────►│  aynı NestJS API + kendi Postgres'i        │
 │  • değişiklik günlüğü     │  HTTPS │  • giden kutusu (replica_outbox)           │
 │  • /sync uçları           │        │  • değişiklik günlüğü (yerel değişiklik)  │
 └──────────────────────────┘        │            ▲                              │
            ▲                         │            │ SQL (aynı makine)            │
            │ /sync/*  (X-Replica-Token)│  ┌─────────┴──────────┐                  │
            └──────────────────────────┼──│ EŞİTLEME AJANI      │                  │
                                       │  └────────────────────┘                  │
                                       │  Arayüz (tarayıcı) · Corel · Runner ──► :3000 │
                                       └───────────────────────────────────────────┘
```

## 1. Roller

`SYNC_ROLE` ortam değişkeni (varsayılan `primary`).

| | Merkez (`primary`) | Yerel sunucu (`replica`) |
|---|---|---|
| Veri | Asıl kaynak | Merkezin (kapsamdaki dükkânların) kopyası |
| Açılış | Dükkân göçü + tohumlama | **Yok** — veritabanı ilk yüklemeye kadar boş; `GET /system/info` → `ready:false` |
| Zamanlanmış görevler | Açık (SCHEDULER_ENABLED) | **Hep kapalı** (Telegram botu, hatırlatma, yedek, kur çekimi, günlük temizliği) |
| Telegram/WhatsApp | Gönderir | **Susar** — işlem merkeze aktarılınca orada bir kez gönderilir |
| Yazma istekleri | Normal | Normal işlenir + **giden kutusuna** yazılır |
| Yalnız-merkez işlemler | Normal | **409** "Bu işlem yalnız merkez sunucuda yapılabilir" |
| `/sync/*` veri uçları | Açık (replika anahtarıyla) | Kapalı (403) |
| Değişiklik günlüğü | Tutulur (replikalar buradan çeker) | Tutulur (yerel değişiklikleri bulmak için) |

**Yalnız-merkez işlemler** (yerelde 409): dükkân/ekip/kullanıcı yönetimi
(`/shops`, `/users`), yedekler (`/backups`), yerel sunucu anahtarları
(`/sync/replicas`), Corel anahtarı üretme/silme, Telegram ayarları ve deneme
mesajları, sabah özeti gönderimi, dükkânlar arası satış ve geri alması.
Kural: dükkân izni tanımı olmayan (`@NoShop`/`@Public`) her yazma ucu ile
`@PrimaryOnly()` işaretli uçlar. Oturum açma/yenileme (`@SyncSkip`) ve Corel
runner'ın klasör bildirimi (`@SyncJournal`) yerelde de çalışır.

Kod: `backend/src/modules/sync/` (`sync-request.ts` kararları verir).

## 2. Değişiklik günlüğü (`sync_changes`)

Her iş tablosuna (`id` birincil anahtarlı ve eşitleme/tekrar koruması
tabloları dışındaki bütün tablolar) açılışta bir **veritabanı tetikleyicisi**
kurulur (`sync-capture.ts`, tekrarı zararsız, cluster'da kilitli). Her
INSERT/UPDATE/DELETE bir satır yazar — ham SQL ve toplu güncellemeler de
kaçmaz.

| Sütun | |
|---|---|
| `seq` | bigint, artan; imleç |
| `table_name`, `row_id` | değişen satır |
| `shop_id` | satırın dükkânı (varsa) — silinen satırın kapsamı için |
| `op` | `I` / `U` / `D` |
| `origin` | `current_setting('stocktrack.sync_origin')` (boş: uygulama) |
| `changed_at` | `clock_timestamp()` — satırın yazıldığı an |

- İçeriği değişmeyen UPDATE yazılmaz.
- `SET LOCAL stocktrack.sync_origin = 'upstream'` ayarlı transaction'daki
  değişiklikler **hiç yazılmaz**. Ajan, merkezden gelen veriyi yerele bu
  ayarla yazar; böylece yerel günlükte yalnız **yerelde yapılan**
  değişiklikler kalır.
- Merkezde günlük `SYNC_RETENTION_DAYS` (30) gün tutulur; silinen son sıra
  `system_settings.sync_pruned_seq`'e yazılır. Daha gerideki imleçle gelen
  replikaya **410 `RESNAPSHOT`** döner.

**Açık transaction boşluğu.** Sıra numarası satır eklenirken alınır, kayıt
transaction bitince görünür. Bu yüzden `100` henüz görünmezken `101`
görünebilir. `GET /sync/changes` ardışık olmayan bir sırada durur
(`waiting: true`); boşluktan sonraki satır `SYNC_GAP_WAIT_SECONDS`'tan (60)
eskiyse boşluk geri alınmış sayılır ve geçilir. Ajan `waiting` gelince kısa
süre sonra aynı imleçle yeniden sorar.

## 3. Yerel sunucu anahtarları

Merkezde **Ayarlar › Yerel sunucular** (yalnız sistem sahibi) ya da:

| Metot | Yol | |
|---|---|---|
| GET | `/sync/replicas` | liste (+ `lag`: merkezin günlüğünden kaç değişiklik geride) |
| POST | `/sync/replicas` | `{ name, shopIds? }` → `{ replica, token }` — **anahtar yalnız bu yanıtta** |
| PATCH | `/sync/replicas/:id` | `{ name?, isActive? }` |
| DELETE | `/sync/replicas/:id` | anahtar çalışmaz olur |

Anahtar `str_…` biçimindedir, merkezde yalnız SHA-256 özeti saklanır.
`shopIds` boşsa replika **bütün dükkânlara** hizmet eder; doluysa yalnız o
dükkânların verisini alır ve yalnız onlar için işlem gönderebilir.

## 4. Merkez uçları (ajan için)

Hepsi `X-Replica-Token: str_…` başlığı ister (JWT değil). Yanıtlar diğer
uçlar gibi `{ success, data }` zarfındadır; aşağıda `data` gösterilir.
Hata gövdesi `{ success:false, statusCode, code?, message }`.

### `GET /sync/hello`
```json
{
  "protocol": 1,
  "serverId": "d91adfff-…",        // merkez kurulumunun kalıcı kimliği
  "role": "primary",
  "schemaHash": "d3bb1818dd1dbd8f", // tablo+sütun özeti
  "seq": "1234",                    // günlüğün şu anki son sırası
  "prunedSeq": "0",
  "serverTime": "2026-10-21T21:23:44.530Z",
  "replica": { "id": "…", "name": "Dükkân PC", "shopIds": ["…"] }
}
```
- `schemaHash` yerel sunucununkiyle (`GET /system/info` → `schemaHash`) aynı
  değilse **eşitleme yapılmaz** (önce iki tarafı aynı sürüme getirin).
- `serverId` daha önce bağlanılandan farklıysa yanlış merkeze bağlanılıyordur
  → dur, kişiye sor.
- `seq` yerelde kayıtlı imleçten küçükse merkez yedekten geri yüklenmiştir →
  baştan yükle (bkz. § 8).

### `GET /sync/schema`
```json
{ "schemaHash": "…", "tables": [
  { "name": "customers", "scope": "shop", "shopScoped": true, "order": 3,
    "dependsOn": [], "columns": [{ "name": "id", "type": "uuid", "nullable": false, "array": false }, …] },
  …
]}
```
- `order`: dış anahtar sırası — upsert'ler artan, silmeler azalan sırayla.
- `scope`: `shop` (`shop_id` replikanın dükkânlarından), `global` (bütün
  satırlar: `shops`, `users`, `exchange_rates`), `transfer` /
  `transfer_item` (dükkânlar arası belgeler: iki taraftan biri replikanınki).
- Eşitlenmeyenler: `sync_changes`, `sync_replicas`, `replica_outbox`,
  `replica_state`, `idempotency_keys`, `system_settings`.
- **`users` parola özetleriyle gelir** (yerelde oturum açılabilsin diye).

### `GET /sync/snapshot?table=&afterId=&limit=`
İlk yükleme. Kapsamdaki satırlar `id` sırasıyla, `limit` ≤ 2000 (varsayılan 500).
```json
{ "table": "customers", "rows": [ { "id": "…", "shop_id": "…", "name": "…", … } ],
  "nextAfterId": "…", "done": false }
```
Satırlar `to_jsonb(satır)` biçimindedir: **veritabanı sütun adları**,
sayılar JSON sayısı, zamanlar ISO metin, jsonb iç içe JSON.

### `GET /sync/changes?since=&limit=`
`limit` ≤ 5000 (varsayılan 1000).
```json
{ "changes": [
    { "seq": "1240", "table": "sales", "id": "…", "op": "upsert", "row": { … } },
    { "seq": "1241", "table": "stock_levels", "id": "…", "op": "delete", "row": null }
  ],
  "lastSeq": "1241", "hasMore": false, "waiting": false }
```
- Sayfadaki satır başına **tek kayıt** (son değişiklik) ve satırın **bugünkü
  hali**. Aynı satır sonraki sayfada yeniden gelebilir — kimliğe göre
  yazıldığından zararsız.
- Kapsam dışı satırlar gelmez. Silinen satır `op:"delete"`; yumuşak silme
  (`deleted_at` dolu) `upsert` olarak gelir.
- Bir sonraki istekte `since = lastSeq`. `hasMore` ise hemen, `waiting` ise
  ~0,5 sn sonra yeniden sor.
- **410** `{ code: "RESNAPSHOT" }`: imleç silinmiş günlüğün gerisinde.

### `POST /sync/rows` `{ table, ids[] ≤ 1000 }`
Kimlikle satırların bugünkü hali: `{ table, rows: [...], missing: [ids] }`.
`missing` = merkezde yok (ya da kapsam dışı). Yerel değişikliği geri almak
için kullanılır (bkz. § 7).

### `POST /sync/push` `{ ops[] ≤ 100 }`
Giden kutusundaki işlemleri **sırayla** uygular.
```json
{ "ops": [{
    "opId": "9b1f…",                 // giden kutusu id'si; merkezde Idempotency-Key
    "actor": "user",                  // ya da "corel" (runner'ın klasör bildirimi)
    "userId": "…",                    // actor=user ise işlemi yapan kişi
    "shopId": "…",
    "method": "POST",
    "path": "/v1/sales",              // API ön eki olmadan, sorgu dahil
    "body": { … },                    // asıl istek gövdesi
    "occurredAt": "2026-10-18T14:00:00.000Z",
    "clientIds": [{ "table": "sales", "id": "…" }, { "table": "sale_items", "id": "…" }],
    "docNos": { "quotes": "TKF-2026-0042" }
}]}
```
Yanıt: `{ results: [{ opId, outcome, httpStatus?, body?, error?, created? }] }`

| `outcome` | Anlamı | Ajan ne yapar |
|---|---|---|
| `applied` | Merkezde uygulandı | `applied`; `created` ile yereldeki kimlik/numaraları karşılaştır |
| `duplicate` | Aynı `opId` daha önce uygulanmış; ilk yanıt döner | `applied` |
| `rejected` | Merkez reddetti (stok yetmedi, yetki yok, kayıt yok, doğrulama…) | `rejected` + `error`; kişi karar verir |
| `retry` | Geçici (5xx, 408, 429, aynı işlem şu an işleniyor) | `pending` kalır; sonra yeniden |
| `skipped` | Önceki işlem `retry` olduğu için denenmedi (sıra korunur) | `pending` kalır |

Merkez her işlemi uygulamanın **kendi ucuna** iç istek olarak gönderir:
işlemi yapan kişi adına kısa ömürlü oturum, `X-Shop-Id`, `Idempotency-Key =
opId`. Sonuç:

- Doğrulama, dükkân izni, iş kuralları (stok, cari…) aynen uygulanır; kişi o
  arada yetkisini kaybettiyse işlem reddedilir.
- Aynı işlem iki kez gönderilse de bir kez uygulanır.
- **Kimlikler:** `clientIds` tablo başına sırayla, o istekte açılan yeni
  kayıtlara verilir (kimlik merkezde doluysa verilmez). Böylece yerelde açılan
  müşteri, teklif, satış merkezde de **aynı kimlikle** olur.
- **Belge numarası:** `docNos.quotes` (TKF-…) / `docNos.shop_transfers`
  (DA-…) merkezde boşsa korunur; doluysa yenisi verilir ve
  `created.docNos`'ta bildirilir (Corel klasörü eski numarayla kalmışsa kişiye
  söylenmeli).
- **Zaman:** iş tarihi verilmemiş kayıtlar (satış, tahsilat, alış, iş, gider,
  cari hareketi, runner klasörü…) ve kayıtların `created_at`'i `occurredAt`
  olur — bağlantının geldiği saat değil.
- Aktarılamayan yollar: `/v1/sync`, `/v1/auth`, `/v1/users`, `/v1/shops`,
  `/v1/backups`, `/v1/system` → `rejected`.
- `clientIds` iç istek başlığına sığmazsa (≈8 KB) her tablonun ilk kaydı
  korunarak kısaltılır.

## 5. Yerel sunucu uçları

| Metot | Yol | Kim | |
|---|---|---|---|
| GET | `/system/info` | herkes (oturumsuz) | `{ role, version, schemaHash, ready, serverTime }` |
| GET | `/system/sync` | oturum açmış | ajan durumu + giden kutusu sayıları (merkezde yalnız `role`) |
| GET | `/system/sync/outbox?state=&page=&limit=` | oturum açmış | `state`: `open` (varsayılan: reddedilen + belirsiz), `pending`, `applied`, `discarded`… |
| POST | `/system/sync/outbox/:id/retry` | sistem sahibi / dükkân yöneticisi | reddedilen/belirsiz → `pending` |
| POST | `/system/sync/outbox/:id/discard` | sistem sahibi / dükkân yöneticisi | → `discarded` (yerel etkisi ajan tarafından geri alınır) |

Arayüz bunları üst şeritte (🖥️ Yerel sunucu · merkez bağlantısı · bekleyen
işlem) ve **Eşitleme** ekranında (`/sync`) gösterir.

## 6. Yerel sunucunun tabloları (ajanla paylaşılır)

### `replica_outbox` — giden kutusu
Yerel sunucu, **dükkân verisine yazan** her başarılı isteği asıl haliyle
yazar (okuma-yetkili POST'lar, oturum, nabız yazılmaz):

| Sütun | |
|---|---|
| `seq` | bigint, birincil — gönderim sırası |
| `id` | işlem kimliği (istemcinin `Idempotency-Key`'i, yoksa uuid) |
| `state` | aşağıdaki durumlar |
| `actor` | `user` / `corel` |
| `user_id`, `shop_id`, `method`, `path`, `body` | istek |
| `occurred_at` | yerelde yapıldığı an |
| `created_ids` | `[{table,id}]` — istekte açılan kayıtlar, sırasıyla |
| `doc_nos` | `{ quotes: "TKF-…" }` |
| `local_status` | yerel yanıt kodu |
| `attempts`, `last_attempt_at`, `upstream_status`, `upstream_body`, `error`, `id_map` | ajanın yazdıkları |
| `resolved_by_id`, `resolved_at` | kişinin kararı |

Durumlar: `executing` → (başarı) `pending` → `pushing` → `applied` |
`rejected` | (geçici) `pending`. Kişi kararı: `rejected/uncertain` →
`pending` (yeniden dene) ya da `discarded`. Yerel sunucu istek sırasında
kapanırsa açılışta `executing` → `uncertain` olur (kendiliğinden gönderilmez).

### `replica_state` — tek satır (`id = 1`), ajan yazar

`upstream_url`, `upstream_server_id`, `last_seq` (merkezden uygulanan son
imleç), `rebased_seq` (yerel günlükte geri alınmış son sıra), `snapshot_at`,
`last_pull_at`, `last_push_at`, `upstream_reachable`, `last_contact_at`,
`last_error`, `agent_version`, `agent_heartbeat_at` (≤ 2 dk eski değilse
"ajan çalışıyor"), **`writes_paused_until`**.

**Yazma duraklatma.** `writes_paused_until > now()` iken yeni yazma istekleri
giden kutusuna girmeden önce bekler (en çok 20 sn, sonra 503 — arayüz 503'ü
"çevrimdışı" sayıp sıraya alır). Ekleme ile denetim tek SQL komutudur, araya
yazma giremez. Süre dolunca kendiliğinden kalkar.

## 7. Ajanın döngüsü

### İlk yükleme
1. `GET /system/info` (yerel) ve `GET /sync/hello` (merkez): şema özetleri
   aynı mı? `serverId` kaydedilenle aynı mı (ilk kez: kaydet)?
2. `GET /sync/schema` → tablolar ve sütunlar.
3. `seq0 = hello.seq`. Her tablo için (`order` sırasıyla) `snapshot` sayfalarını
   yaz.
4. `replica_state`: `last_seq = seq0`, `rebased_seq = max(yerel sync_changes.seq)`,
   `snapshot_at = now()`.
5. `changes since seq0` ile yakala.

**Yazma kuralı** (her merkez verisi için):
```sql
BEGIN;
SET LOCAL stocktrack.sync_origin = 'upstream';   -- yerel günlüğe girmesin
-- silmeler (order azalan)
DELETE FROM "<table>" WHERE id = $1;
-- upsert'ler (order artan)
INSERT INTO "<table>" SELECT * FROM jsonb_populate_record(NULL::"<table>", $1::jsonb)
ON CONFLICT (id) DO UPDATE SET (<sütunlar>) = (SELECT EXCLUDED.<sütunlar>);
COMMIT;
```
Kendine bağlı dış anahtar yoktur; `order` sırası yeterlidir. Yine de bir
dış anahtar hatası olursa o satırları partinin sonunda yeniden dene.
Alternatif: `SET LOCAL session_replication_role = replica` (süper kullanıcı ya
da `GRANT SET ON PARAMETER` gerekir) hem dış anahtar denetimini hem
tetikleyiciyi kapatır.

### Tur (birkaç saniyede bir; merkez yoksa üstel bekleme)
1. **Nabız:** `agent_heartbeat_at = now()`.
2. **Merkez ayakta mı?** `hello`. Değilse `upstream_reachable = false`,
   `last_error`, bekle.
3. **Duraklat:** `writes_paused_until = now() + 30 sn`; ~300 ms bekle;
   `executing` kalmayınca devam.
4. **Gönder:** `pending` işlemleri `seq` sırasıyla ≤100'lük partilerle
   `POST /sync/push`. Gönderilenler önce `pushing`. Sonuçları yaz (§ 4).
   `retry` gelirse dur (sıra korunur).
5. **Geri al (rebase)** — yalnız `executing/pending/pushing` işlem
   kalmadıysa:
   - Yerel günlükte `seq > rebased_seq` olan satırları topla
     (`table_name, row_id`).
   - Her tablo için `POST /sync/rows` → gelenleri yaz (upsert), `missing`
     olanları yerelden sil. Yazma kuralı yukarıdaki gibi (`upstream`).
   - `rebased_seq = toplananların en büyüğü`.
   - Sonuç: başarılı işlemlerin yerel etkisi merkezdeki asıl haliyle değişir,
     reddedilen/vazgeçilen işlemlerin etkisi kalkar. Kimlikler zaten aynı
     olduğundan çift kayıt oluşmaz.
6. **Çek:** `changes since last_seq` → yaz → `last_seq`, `last_pull_at`.
7. **Duraklatmayı kaldır**, `last_contact_at`, `upstream_reachable = true`.

Merkez yokken ajan yalnız nabız ve bağlantı denemesi yapar; yerel sunucu
çalışmaya devam eder, giden kutusu dolar.

### Bakım (yerel sunucuda zamanlayıcılar kapalı olduğu için ajanın işi)
Günde bir: yerel `sync_changes`'te `seq <= rebased_seq` olan satırları,
giden kutusunda 30 günden eski `applied`/`discarded` satırları ve 14 günden
eski `idempotency_keys` kayıtlarını sil.

### Önemli kurallar
- Rebase ve çekme **yalnız gönderilmeyi bekleyen işlem yokken** yapılır
  (aksi halde bekleyen işlemin yerel etkisi silinir). Duraklatma bunu
  garanti eder.
- `rejected`/`uncertain` işlem varken rebase yapılır: o işlemlerin etkisi
  kalkar; kişi "yeniden dene" derse işlem tekrar gönderilir.
- Giden kutusu ve `replica_state` eşitlenen tablolar değildir; ajan
  baştan yüklerken bunları **silmez**.

## 8. Özel durumlar

| Durum | Ajan |
|---|---|
| 410 `RESNAPSHOT` / merkezde `seq` geriledi | Önce bekleyen işlemleri gönder; sonra eşitlenen tabloları boşalt (giden kutusu kalır), ilk yüklemeyi yap |
| `schemaHash` farklı | Eşitleme yapma, `last_error` = "sürüm farkı"; kişiye bildir |
| `serverId` farklı | Dur; kişi onaylamadan devam etme |
| `created.docNos` yereldekinden farklı | `id_map`/`error`'a yaz, kişiye bildir (Corel klasörü eski numarayla) |
| Merkez 401 (anahtar) | Dur, `last_error`; kişi yeni anahtar girsin |
| Yerel sunucu kapalı | Bekle; ajan da veritabanına ulaşamıyorsa tekrar dene |

## 9. Kurulum

1. Merkezde **Ayarlar › Yerel sunucular** → ad + dükkânlar → *Anahtar üret*.
2. Dükkân bilgisayarında yerel sunucu: `docker compose -f docker-compose.replica.yml up -d`
   (ya da `SYNC_ROLE=replica` ile backend + Postgres). JWT anahtarları
   merkezinkinden **farklı** olmalı.
3. Eşitleme ajanını `UPSTREAM_URL` (merkez, `…/api/v1`) ve `REPLICA_TOKEN`
   ile başlat. İlk yükleme bitince yerelde giriş yapılabilir.
4. Dükkândaki tarayıcılar yerel sunucuya (`http://<pc-ip>/`) bağlanır.
5. Corel eklentisi: iş menüsü 7 → `5=<pc-ip>` (yerel sunucu). Runner aynı
   ayarı okur (ya da `config.json` → `fallback_server`).

## 10. Sözleşme testi

```
PRIMARY_URL=http://merkez/api/v1 REPLICA_URL=http://yerel/api/v1 \
REPLICA_DB=postgres://…/stocktrack_replica node scripts/sync-contract-test.mjs
```
İlk yükleme, yerelde satış/teklif/runner bildirimi, giden kutusu, yalnız-merkez
işlemler, gönderme (aynı kimlik/numara, asıl tarih), çakışma ve reddi, geri
alma sonrası yerel = merkez, kişinin kararı, merkezden gelen değişiklik. Ajan
bu adımları kendi koduyla aynı sonuçla geçmelidir.

## 11. Sınırlar

- Dükkânlar arası satış, ekip/dükkân yönetimi, yedek, Telegram ayarları,
  Corel anahtarı yerelde yapılmaz (merkezde yapılır).
- Dosya yükleyen uçlar (yedek geri yükleme) yerelde yoktur.
- Merkez yokken yerelde yapılan iş, bağlantı gelince merkezde **yeniden
  işlenir**: arada merkezde değişen veri (stok başka yerde satıldı, müşteri
  silindi) işlemi reddettirebilir — karar Eşitleme ekranında verilir.
- `SYNC_RETENTION_DAYS`'ten uzun bağlanmayan yerel sunucu baştan yüklenir.
- Yerel sunucu kullanıcıların parola özetlerini tutar: makineyi ve yerel
  veritabanını koruyun; anahtarı yalnız ajanın ayarında saklayın.

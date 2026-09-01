# Banka Entegrasyonu — Albaraka hesap hareketlerini otomatik almak

Bu belge, hesap hareketlerini **otomatik** almak için hangi yolların olduğunu ve
uygulamanın bunlara nasıl hazırlandığını anlatır.

## Neden "açık bir API" yok

Döviz kuru gibi veriler herkese açıktır, ama hesap hareketi **size ait özel
veridir**. Hiçbir banka bunu kimlik doğrulaması ve sözleşme olmadan vermez.
Türkiye'de bu alan BDDK'nın açık bankacılık çerçevesine tabidir; hesap bilgisi
hizmetini doğrudan çekmek için lisanslı kuruluş olmak ya da lisanslı bir aracı
üzerinden gitmek gerekir.

> **Not:** Albaraka'nın güncel kurumsal API/açık bankacılık kanalı bu belgede
> doğrulanmamıştır — banka ürünleri değişir. Aşağıdaki soruları doğrudan
> Albaraka kurumsal müşteri temsilcinize sorun.

## Bankaya sorulacaklar

1. **Kurumsal hesap hareketi için API** sunuyor musunuz? (REST/SOAP, kimlik
   doğrulama yöntemi, sertifika/IP kısıtı, sözleşme süreci)
2. **Otomatik ekstre dosyası** gönderimi var mı? (SFTP ya da e-posta ile günlük)
   Varsa hangi formatta: **MT940**, **CAMT.053**, CSV, Excel?
3. Açık bankacılık üzerinden **hesap bilgisi hizmeti** için hangi aracıyla
   çalışıyorsunuz?
4. Test/sandbox ortamı var mı?

## Üç yol

| Yol | Ne gerekir | Ne kadar sürer | Otomasyon |
|-----|------------|----------------|-----------|
| **Ekstre dosyası (CSV/Excel)** | Hiçbir şey — internet bankacılığından indirin | Bugün | Yarı otomatik (dosyayı siz yüklersiniz) |
| **SFTP/e-posta ile otomatik ekstre** | Bankayla dosya aktarım anlaşması | Haftalar | Tam otomatik |
| **Kurumsal API / açık bankacılık** | Sözleşme + sertifika/IP | Aylar | Tam otomatik |

**Yapılmaması gereken:** İnternet bankacılığına robotla giriş (scraping).
Banka sözleşmesine aykırıdır, 2FA'yı kırmayı gerektirir, hesap kilitlenebilir ve
bankacılık şifrenizi sunucuda tutmak demektir. Bu proje bunu desteklemez.

## Uygulama bu yollardan hangisine hazır?

Hepsine. Mutabakat modülü **veri kaynağından bağımsız** tasarlandı:

```
[Ekstre dosyası]  ─┐
[SFTP / e-posta]  ─┼─→  importRows()  →  bank_transactions  →  eşleştirme
[Banka API'si]    ─┘
```

Bugün çalışan kısım: **CSV ekstre yükleme** (Mutabakat ekranı). Yarın SFTP ya da
API geldiğinde yalnızca `importRows()` çağıran katman yazılır — eşleştirme,
mükerrer engelleme ve onay akışı aynen kalır.

### Mükerrer kayıt engelleme
Her hareket bir `fingerprint` taşır: banka bir dekont/referans numarası
veriyorsa ondan, vermiyorsa tarih + tutar + açıklamadan üretilir. Aynı ekstreyi
iki kez yüklerseniz ikinci seferde hiçbir şey eklenmez.

### Eşleştirme nasıl çalışır
- **Tutar** tutmuyorsa (±%1 tolerans) aday hiç gösterilmez.
- **Tarih** ±5 gün penceresi dışındaysa aday gösterilmez.
- Kalan puan: tarih yakınlığı, müşteri/tedarikçi adının ekstre açıklamasında
  geçmesi ve referans numarasının eşleşmesi.
- **Yön zorunlu:** hesaba giriş yalnızca *tahsilat* ile, çıkış *sahibe ödeme*
  veya *gider* ile eşleşir.
- Bir kayıt yalnızca **tek** banka hareketine bağlanabilir.
- **Hiçbir eşleştirme kendiliğinden onaylanmaz** — sistem aday önerir, onayı
  siz verirsiniz. Yanlış bir otomatik eşleşme cari bakiyeyi sessizce bozamaz.

## Uçlar

| Metot | Yol | Açıklama |
|-------|-----|----------|
| POST | `/bank-reconciliation/import` | `{ bankAccountId, csv, mapping }` |
| GET | `/bank-reconciliation?status=unmatched` | Mutabakat kuyruğu |
| GET | `/bank-reconciliation/summary` | Bekleyen/eşleşen sayıları ve tutarları |
| GET | `/bank-reconciliation/:id/suggestions` | Puanlanmış adaylar |
| POST | `/bank-reconciliation/:id/match` | `{ type, matchId }` — onay |
| POST | `/bank-reconciliation/:id/unmatch` | Eşleştirmeyi geri al |
| POST | `/bank-reconciliation/:id/ignore` | Mutabakat dışında bırak |

Tümü yalnızca İşletme Sahibi yetkisindedir.

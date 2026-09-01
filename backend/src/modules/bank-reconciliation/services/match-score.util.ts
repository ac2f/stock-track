/**
 * Banka hareketi ile uygulamadaki kayıtları eşleştirme puanlaması.
 *
 * Saf fonksiyonlardır (veritabanı bilmez) → kural değişikliği test edilebilir.
 * Puan 0–100 arasıdır; eşik altındaki adaylar kullanıcıya HİÇ gösterilmez,
 * yüksek puanlılar "muhtemel" diye işaretlenir. Karar her zaman kullanıcınındır —
 * hiçbir eşleştirme kendiliğinden onaylanmaz.
 */

/** Tutar bu orandan fazla saparsa aday sayılmaz (%1). */
const AMOUNT_TOLERANCE = 0.01;
/** Tarih bu kadar günden uzaksa aday sayılmaz. */
export const DATE_WINDOW_DAYS = 5;
/** Bu puanın altındaki adaylar gösterilmez. */
export const MIN_SCORE = 40;

/** Türkçe duyarlı sadeleştirme: harf/rakam dışını at, küçült. */
export function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** İki tarih arasındaki tam gün farkı. */
export function daysBetween(a: string | Date, b: string | Date): number {
  const d1 = new Date(a).setHours(0, 0, 0, 0);
  const d2 = new Date(b).setHours(0, 0, 0, 0);
  return Math.abs(Math.round((d1 - d2) / 86_400_000));
}

/**
 * Bir ismin metin içinde geçip geçmediği — kelime bazlı.
 * "AHMET YILMAZ" ile "FAST ODEME AHMET YILMAZ ISTANBUL" eşleşir; tek harfli
 * ya da çok kısa parçalar yanlış eşleşme yapmasın diye sayılmaz.
 */
export function nameOverlap(
  candidateName: string | null | undefined,
  haystack: string,
): number {
  const words = normalize(candidateName)
    .split(' ')
    .filter((w) => w.length >= 3);
  if (!words.length) return 0;
  const text = normalize(haystack);
  const hits = words.filter((w) => text.includes(w)).length;
  return hits / words.length;
}

export interface ScoreInput {
  /** Banka hareketinin işaretli tutarı. */
  txAmount: number;
  txDate: string | Date;
  /** Ekstre açıklaması + karşı taraf adı birleşimi. */
  txText: string;
  /** Adayın tutarı (işaretsiz — yön ayrıca kontrol edilir). */
  candidateAmount: number;
  candidateDate: string | Date;
  /** Müşteri/tedarikçi adı gibi metinde aranacak ad. */
  candidateName?: string | null;
  /** Adayın referans/dekont numarası (varsa açıklamada aranır). */
  candidateReference?: string | null;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

/**
 * Bir adayın banka hareketiyle ne kadar örtüştüğü.
 *
 * Ağırlıklar: tutar eşleşmesi olmazsa olmazdır (aday elenir); geri kalan puan
 * tarih yakınlığı, isim geçişi ve referans numarasından gelir.
 */
export function scoreCandidate(input: ScoreInput): ScoreResult | null {
  const txAmount = Math.abs(Number(input.txAmount));
  const candidate = Math.abs(Number(input.candidateAmount));
  if (!txAmount || !candidate) return null;

  // 1) Tutar — tolerans dışındaysa aday değil.
  const diff = Math.abs(txAmount - candidate);
  if (diff > txAmount * AMOUNT_TOLERANCE) return null;

  const reasons: string[] = [];
  let score = 50; // tutar tuttu
  reasons.push(diff === 0 ? 'Tutar birebir aynı' : 'Tutar çok yakın');

  // 2) Tarih — pencere dışındaysa aday değil.
  const days = daysBetween(input.txDate, input.candidateDate);
  if (days > DATE_WINDOW_DAYS) return null;
  if (days === 0) {
    score += 25;
    reasons.push('Aynı gün');
  } else {
    score += Math.max(0, 25 - days * 5);
    reasons.push(`${days} gün fark`);
  }

  // 3) İsim — ekstre açıklamasında geçiyor mu?
  const overlap = nameOverlap(input.candidateName, input.txText);
  if (overlap > 0) {
    score += Math.round(overlap * 20);
    reasons.push(
      overlap === 1 ? 'Adı açıklamada geçiyor' : 'Adı kısmen geçiyor',
    );
  }

  // 4) Referans/dekont numarası açıklamada geçiyorsa güçlü kanıt.
  const ref = normalize(input.candidateReference).replace(/\s/g, '');
  if (ref.length >= 4 && normalize(input.txText).replace(/\s/g, '').includes(ref)) {
    score += 15;
    reasons.push('Referans numarası eşleşti');
  }

  return { score: Math.min(100, score), reasons };
}

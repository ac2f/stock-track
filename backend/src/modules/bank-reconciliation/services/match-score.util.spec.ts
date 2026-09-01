import {
  DATE_WINDOW_DAYS,
  daysBetween,
  nameOverlap,
  normalize,
  scoreCandidate,
} from './match-score.util';

/**
 * Eşleştirme puanlaması. Tutar tutmuyorsa ya da tarih penceresi dışındaysa
 * aday HİÇ gösterilmez; kalanlar tarih yakınlığı, isim ve referansla puanlanır.
 */
describe('scoreCandidate', () => {
  const base = {
    txAmount: 3500,
    txDate: '2026-03-10',
    txText: 'FAST GELEN AHMET YILMAZ ODEME',
    candidateAmount: 3500,
    candidateDate: '2026-03-10',
    candidateName: 'Ahmet Yılmaz',
  };

  it('birebir eşleşmeye yüksek puan verir', () => {
    const r = scoreCandidate(base)!;
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.reasons).toContain('Tutar birebir aynı');
    expect(r.reasons).toContain('Aynı gün');
  });

  it('tutar tutmuyorsa aday saymaz', () => {
    expect(scoreCandidate({ ...base, candidateAmount: 3200 })).toBeNull();
  });

  it('kuruş farkını tolere eder', () => {
    // %1 tolerans: 3500 için 35 TL'ye kadar sapma kabul.
    expect(scoreCandidate({ ...base, candidateAmount: 3499.5 })).not.toBeNull();
  });

  it('tarih penceresi dışını eler', () => {
    expect(
      scoreCandidate({ ...base, candidateDate: '2026-02-01' }),
    ).toBeNull();
  });

  it('tarih uzaklaştıkça puan düşer', () => {
    const same = scoreCandidate(base)!.score;
    const later = scoreCandidate({ ...base, candidateDate: '2026-03-13' })!.score;
    expect(later).toBeLessThan(same);
  });

  it('isim geçmiyorsa yine aday olur ama daha düşük puanla', () => {
    const withName = scoreCandidate(base)!.score;
    const without = scoreCandidate({ ...base, candidateName: 'Zeynep Kaya' })!
      .score;
    expect(without).toBeLessThan(withName);
  });

  it('işaret yönünden bağımsız çalışır (çıkış hareketi)', () => {
    const r = scoreCandidate({ ...base, txAmount: -3500 })!;
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('referans numarası açıklamada geçerse puan ekler', () => {
    const withRef = scoreCandidate({
      ...base,
      txText: 'HAVALE FT-2026-0012 AHMET YILMAZ',
      candidateReference: 'FT-2026-0012',
    })!;
    expect(withRef.reasons).toContain('Referans numarası eşleşti');
    expect(withRef.score).toBe(100);
  });

  it('sıfır tutarlı kayıtları eler', () => {
    expect(scoreCandidate({ ...base, candidateAmount: 0 })).toBeNull();
  });
});

describe('yardımcılar', () => {
  it('normalize Türkçe karakterleri korur, noktalamayı atar', () => {
    expect(normalize('  AHMET-YILMAZ,  Şirketi ')).toBe('ahmet yılmaz şirketi');
  });

  it('nameOverlap kısa parçaları saymaz', () => {
    // "A" ve "ve" gibi parçalar yanlış eşleşme yapmasın.
    expect(nameOverlap('A ve B Ltd', 'tamamen ilgisiz metin')).toBe(0);
  });

  it('nameOverlap kısmi geçişi oranlar', () => {
    expect(nameOverlap('Ahmet Yılmaz', 'gelen havale ahmet bey')).toBe(0.5);
  });

  it('daysBetween saat farkından etkilenmez', () => {
    expect(daysBetween('2026-03-10T23:30:00Z', '2026-03-10T01:00:00Z')).toBe(0);
  });

  it('tarih penceresi sabiti makul', () => {
    expect(DATE_WINDOW_DAYS).toBeGreaterThanOrEqual(3);
  });
});

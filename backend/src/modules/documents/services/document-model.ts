import { ResolvedBusiness } from '../../settings/settings.service';

/** Belgenin tarafı (müşteri, cari…): ilk satır ad, kalanı ayrıntı. */
export interface Party {
  label: string;
  lines: string[];
}

/** Tek tablo: başlıklar, satırlar ve altında toplam satırları. */
export interface Section {
  /** Bölüm başlığı (opsiyonel). */
  title?: string;
  headers: string[];
  /** Sütun hizaları; verilmezse ilk sütun sola, kalanlar sağa yaslanır. */
  aligns?: ('left' | 'right')[];
  rows: (string | number)[][];
  /** Tablo altı toplam satırları (etiket → değer). Sonuncusu vurgulanır. */
  foot?: [string, string][];
  /** Son sütun (ör. bakiye) kalın yazılsın. */
  emphasizeLast?: boolean;
}

/**
 * Bir belgenin yapısı. HTML (`DocumentHtmlService`) ve PDF
 * (`DocumentPdfService`) aynı modelden üretilir; böylece ekranda görülen ile
 * yazdırılan/indirilen aynı içeriktir.
 */
export interface DocModel {
  business: ResolvedBusiness;
  docTitle: string;
  pageTitle: string;
  meta: [string, string][];
  parties: Party[];
  sections: Section[];
  note?: string | null;
}

import { Injectable } from '@nestjs/common';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { DocModel, Party, Section } from './document-model';

// Yazı tipi: Liberation Sans (SIL OFL). Standart PDF yazı tipleri ş/ğ/ı/İ
// harflerini içermediğinden Türkçe için gömülü TTF gerekir.
const FONT_DIR = join(__dirname, '..', 'fonts');
const REGULAR = join(FONT_DIR, 'LiberationSans-Regular.ttf');
const BOLD = join(FONT_DIR, 'LiberationSans-Bold.ttf');

const A4 = { w: 595.28, h: 841.89 };
const M = { left: 40, right: 40, top: 40, bottom: 56 };
const CONTENT_W = A4.w - M.left - M.right;

const C = {
  ink: '#1e293b',
  muted: '#64748b',
  faint: '#94a3b8',
  rule: '#e2e8f0',
  headBg: '#f1f5f9',
  zebra: '#f8fafc',
  accent: '#2563eb',
};

const SIZE = { body: 9, small: 8, head: 7.5, title: 13, name: 18 };
const PAD_X = 6;
const PAD_Y = 5;

/**
 * Belge modelinden (cari ekstre, fatura, rapor…) A4 PDF üretir.
 *
 * - Türkçe karakterler için gömülü yazı tipi.
 * - Tablo sütun genişlikleri içeriğe göre hesaplanır; uzun açıklamalar sarılır.
 * - Tablo sayfaya sığmazsa yeni sayfada BAŞLIK SATIRI tekrarlanır.
 * - Her sayfanın altında "Sayfa x / y" ve oluşturulma tarihi.
 */
@Injectable()
export class DocumentPdfService {
  async render(model: DocModel): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: M,
      bufferPages: true,
      info: {
        Title: model.pageTitle,
        Author: model.business.name || 'StockTrack',
        Creator: 'StockTrack',
        Subject: model.docTitle,
      },
    });
    doc.registerFont('Sans', REGULAR);
    doc.registerFont('Sans-Bold', BOLD);

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    let y = this.header(doc, model);
    y = this.parties(doc, model.parties, y);
    for (const s of model.sections) y = this.section(doc, s, y);
    if (model.note) y = this.note(doc, model.note, y);
    this.footers(doc, model);

    doc.end();
    return done;
  }

  // ── Başlık ─────────────────────────────────────────────────────────
  private header(doc: PDFKit.PDFDocument, m: DocModel): number {
    const top = M.top;
    const rightW = 220;
    const leftW = CONTENT_W - rightW - 16;

    doc.font('Sans-Bold').fontSize(SIZE.name).fillColor(C.ink);
    doc.text(m.business.name || 'StockTrack', M.left, top, { width: leftW });
    let ly = doc.y + 2;
    doc.font('Sans').fontSize(SIZE.small).fillColor(C.muted);
    for (const line of [m.business.phone, m.business.address]) {
      if (!line) continue;
      doc.text(line, M.left, ly, { width: leftW });
      ly = doc.y + 1;
    }

    const rx = A4.w - M.right - rightW;
    doc.font('Sans-Bold').fontSize(SIZE.title).fillColor(C.accent);
    doc.text(m.docTitle, rx, top + 2, { width: rightW, align: 'right' });
    let ry = doc.y + 3;
    doc.font('Sans').fontSize(SIZE.small).fillColor(C.muted);
    for (const [k, v] of m.meta) {
      doc.text(`${k}: ${v}`, rx, ry, { width: rightW, align: 'right' });
      ry = doc.y + 1;
    }

    const bottom = Math.max(ly, ry) + 8;
    doc
      .moveTo(M.left, bottom)
      .lineTo(A4.w - M.right, bottom)
      .lineWidth(1.5)
      .strokeColor(C.accent)
      .stroke();
    return bottom + 14;
  }

  // ── Taraflar ───────────────────────────────────────────────────────
  private parties(doc: PDFKit.PDFDocument, parties: Party[], y: number): number {
    if (!parties.length) return y;
    const gap = 20;
    const colW = (CONTENT_W - gap * (parties.length - 1)) / parties.length;
    let bottom = y;
    parties.forEach((p, i) => {
      const x = M.left + i * (colW + gap);
      doc.font('Sans-Bold').fontSize(SIZE.head).fillColor(C.faint);
      doc.text(p.label.toLocaleUpperCase('tr-TR'), x, y, {
        width: colW,
        characterSpacing: 0.5,
      });
      let py = doc.y + 2;
      p.lines.forEach((line, li) => {
        doc
          .font(li === 0 ? 'Sans-Bold' : 'Sans')
          .fontSize(li === 0 ? 11 : SIZE.body)
          .fillColor(li === 0 ? C.ink : C.muted);
        doc.text(line, x, py, { width: colW });
        py = doc.y + 1;
      });
      bottom = Math.max(bottom, py);
    });
    return bottom + 16;
  }

  // ── Tablo ──────────────────────────────────────────────────────────
  private section(doc: PDFKit.PDFDocument, s: Section, y: number): number {
    const aligns = s.aligns ?? s.headers.map((_, i) => (i === 0 ? 'left' : 'right'));
    const widths = this.columnWidths(doc, s, aligns);
    const limit = A4.h - M.bottom;

    if (s.title) {
      y = this.ensure(doc, y, 40);
      doc.font('Sans-Bold').fontSize(SIZE.small).fillColor(C.muted);
      doc.text(s.title.toLocaleUpperCase('tr-TR'), M.left, y, {
        width: CONTENT_W,
        characterSpacing: 0.4,
      });
      y = doc.y + 6;
    }

    const drawHeader = (at: number): number => {
      doc.rect(M.left, at, CONTENT_W, 20).fill(C.headBg);
      doc.font('Sans-Bold').fontSize(SIZE.head).fillColor(C.muted);
      let x = M.left;
      s.headers.forEach((h, i) => {
        doc.text(h.toLocaleUpperCase('tr-TR'), x + PAD_X, at + 6.5, {
          width: widths[i] - PAD_X * 2,
          align: aligns[i],
          lineBreak: false,
          characterSpacing: 0.3,
        });
        x += widths[i];
      });
      return at + 20;
    };

    y = this.ensure(doc, y, 20 + 30);
    y = drawHeader(y);

    if (!s.rows.length) {
      doc.font('Sans').fontSize(SIZE.body).fillColor(C.faint);
      doc.text('Kayıt yok.', M.left, y + 12, { width: CONTENT_W, align: 'center' });
      y += 36;
    }

    s.rows.forEach((row, ri) => {
      const cells = row.map((c) => String(c));
      const bold = (i: number) => !!s.emphasizeLast && i === cells.length - 1;
      const h =
        Math.max(
          ...cells.map((t, i) => {
            doc.font(bold(i) ? 'Sans-Bold' : 'Sans').fontSize(SIZE.body);
            return doc.heightOfString(t || ' ', { width: widths[i] - PAD_X * 2 });
          }),
        ) +
        PAD_Y * 2;

      if (y + h > limit) {
        doc.addPage();
        y = drawHeader(M.top);
      }
      if (ri % 2 === 1) doc.rect(M.left, y, CONTENT_W, h).fill(C.zebra);
      doc
        .moveTo(M.left, y + h)
        .lineTo(A4.w - M.right, y + h)
        .lineWidth(0.5)
        .strokeColor(C.rule)
        .stroke();

      let x = M.left;
      cells.forEach((t, i) => {
        doc.font(bold(i) ? 'Sans-Bold' : 'Sans').fontSize(SIZE.body).fillColor(C.ink);
        doc.text(t, x + PAD_X, y + PAD_Y, {
          width: widths[i] - PAD_X * 2,
          align: aligns[i],
        });
        x += widths[i];
      });
      y += h;
    });

    if (s.foot?.length) y = this.foot(doc, s.foot, y + 8);
    return y + 16;
  }

  /** Sütun genişlikleri: içeriğe göre; artan/eksik pay en uzun sola yaslı sütunda. */
  private columnWidths(
    doc: PDFKit.PDFDocument,
    s: Section,
    aligns: ('left' | 'right')[],
  ): number[] {
    const n = s.headers.length;
    const need = s.headers.map((h, i) => {
      doc.font('Sans-Bold').fontSize(SIZE.head);
      let w = doc.widthOfString(h.toLocaleUpperCase('tr-TR')) + 4;
      doc.font('Sans').fontSize(SIZE.body);
      for (const r of s.rows) {
        w = Math.max(w, doc.widthOfString(String(r[i] ?? '')));
      }
      return w + PAD_X * 2;
    });
    const widths = need.map((w, i) =>
      aligns[i] === 'left' ? Math.min(w, CONTENT_W * 0.55) : w,
    );
    const lefts = widths.map((_, i) => i).filter((i) => aligns[i] === 'left');
    const grow = lefts.length
      ? lefts.reduce((a, b) => (need[b] > need[a] ? b : a))
      : n - 1;
    const sum = widths.reduce((a, b) => a + b, 0);
    if (sum < CONTENT_W) {
      widths[grow] += CONTENT_W - sum;
    } else if (sum > CONTENT_W) {
      // Sığmıyor: en uzun sola yaslı sütunu daralt (metni sarılır).
      const others = sum - widths[grow];
      widths[grow] = Math.max(60, CONTENT_W - others);
      const fixed = widths.reduce((a, b) => a + b, 0);
      if (fixed > CONTENT_W) {
        const k = CONTENT_W / fixed;
        for (let i = 0; i < n; i++) widths[i] *= k;
      }
    }
    return widths;
  }

  // ── Toplamlar ──────────────────────────────────────────────────────
  private foot(doc: PDFKit.PDFDocument, rows: [string, string][], y: number): number {
    const valueW = 130;
    const labelW = 220;
    const valueX = A4.w - M.right - valueW;
    const labelX = valueX - 8 - labelW;
    rows.forEach(([label, value], idx) => {
      const last = idx === rows.length - 1;
      const size = last ? 12 : SIZE.body;
      y = this.ensure(doc, y, size + 20);
      if (last) {
        doc
          .moveTo(labelX, y)
          .lineTo(A4.w - M.right, y)
          .lineWidth(1.2)
          .strokeColor(C.ink)
          .stroke();
        y += 7;
      }
      doc
        .font(last ? 'Sans-Bold' : 'Sans')
        .fontSize(last ? SIZE.body + 1 : SIZE.body)
        .fillColor(last ? C.ink : C.muted);
      doc.text(label, labelX, y + (last ? 1.5 : 0), {
        width: labelW,
        align: 'right',
        lineBreak: false,
      });
      doc.font(last ? 'Sans-Bold' : 'Sans').fontSize(size).fillColor(C.ink);
      doc.text(value, valueX, y, {
        width: valueW - PAD_X,
        align: 'right',
        lineBreak: false,
      });
      y += size + (last ? 8 : 6);
    });
    return y;
  }

  private note(doc: PDFKit.PDFDocument, note: string, y: number): number {
    y = this.ensure(doc, y, 40);
    doc.font('Sans-Bold').fontSize(SIZE.head).fillColor(C.faint);
    doc.text('NOT', M.left, y, { characterSpacing: 0.5 });
    doc.font('Sans').fontSize(SIZE.body).fillColor(C.muted);
    doc.text(note, M.left, doc.y + 2, { width: CONTENT_W });
    return doc.y + 10;
  }

  /** Kalan yer `need`ten azsa yeni sayfaya geçer; yeni y döner. */
  private ensure(doc: PDFKit.PDFDocument, y: number, need: number): number {
    if (y + need <= A4.h - M.bottom) return y;
    doc.addPage();
    return M.top;
  }

  // ── Sayfa altlığı: tüm sayfalar bittikten sonra "Sayfa x / y" ───────
  private footers(doc: PDFKit.PDFDocument, m: DocModel): void {
    const range = doc.bufferedPageRange();
    const stamp = new Date().toLocaleString('tr-TR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const y = A4.h - 36;
      doc
        .moveTo(M.left, y - 8)
        .lineTo(A4.w - M.right, y - 8)
        .lineWidth(0.5)
        .strokeColor(C.rule)
        .stroke();
      // Alt kenar boşluğunun içine yazılır: sayfa eklenmesin diye geçici sıfırlanır.
      const keep = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Sans').fontSize(SIZE.head).fillColor(C.faint);
      doc.text(`${m.business.name || 'StockTrack'} · ${m.docTitle} · ${stamp}`, M.left, y, {
        width: CONTENT_W - 80,
        lineBreak: false,
      });
      doc.text(`Sayfa ${i - range.start + 1} / ${range.count}`, A4.w - M.right - 80, y, {
        width: 80,
        align: 'right',
        lineBreak: false,
      });
      doc.page.margins.bottom = keep;
    }
  }
}

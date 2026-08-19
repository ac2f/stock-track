import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { LedgerEntryType } from '../../common/enums/ledger-entry-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { CustomersService } from '../customers/services/customers.service';
import { PaymentsService } from '../customers/services/payments.service';
import { PlatesService } from '../materials/services/plates.service';
import { MaterialCategoriesService } from '../materials/services/material-categories.service';
import { FinancialReportsService } from '../reports/services/financial-reports.service';
import { TelegramBackupService } from '../backups/telegram-backup.service';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { Keyboard, TelegramApiService } from './telegram-api.service';
import { TelegramSessionService } from './telegram-session.service';

/** Bir ekranın çıktısı: gövde metni + altındaki düğmeler. */
export interface Screen {
  text: string;
  keyboard: Keyboard;
}

const money = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

const esc = TelegramApiService.escape;

/** Listelerde sayfa başına kaç kayıt gösterilir. */
const PAGE = 8;

const METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Nakit',
  [PaymentMethod.BANK_TRANSFER]: 'Havale/EFT',
  [PaymentMethod.CARD]: 'Kart',
};

/**
 * Telegram arayüzünün ekranları.
 *
 * Her ekran saf bir fonksiyondur: iş servislerinden okur, metin + düğme üretir.
 * Düğme verisi (`callback_data`) Telegram'da 64 baytla sınırlı olduğu için kısa
 * önekler kullanılır: `cst:<id>` müşteri kartı, `pay:<id>` tahsilat vb.
 *
 * Yetki denetimi burada DEĞİL, çağıran bot servisindedir — hiçbir ekran
 * doğrulanmamış bir kullanıcıya ulaşmaz.
 */
@Injectable()
export class TelegramScreensService {
  constructor(
    private readonly customers: CustomersService,
    private readonly payments: PaymentsService,
    private readonly plates: PlatesService,
    private readonly categories: MaterialCategoriesService,
    private readonly reports: FinancialReportsService,
    private readonly users: UsersService,
    private readonly banks: BankAccountsService,
    private readonly backups: TelegramBackupService,
    private readonly settings: SettingsService,
    private readonly sessions: TelegramSessionService,
  ) {}

  // ── Ana menü ────────────────────────────────────────────────────────
  async home(): Promise<Screen> {
    const business = await this.settings.getBusiness();
    return {
      text:
        `<b>${esc(business.name)}</b>\n` +
        'Ne yapmak istersiniz? Aşağıdaki düğmelerden ilerleyin.',
      keyboard: [
        [
          { text: '👥 Cari / Müşteri', data: 'cari' },
          { text: '💰 Tahsilat', data: 'cari' },
        ],
        [
          { text: '📦 Stok', data: 'stk' },
          { text: '📊 Raporlar', data: 'rep' },
        ],
        [
          { text: '🗄️ Yedek', data: 'bkp' },
          { text: 'ℹ️ Yardım', data: 'help' },
        ],
      ],
    };
  }

  help(): Screen {
    return {
      text:
        '<b>Yardım</b>\n\n' +
        'Menüde düğmelerle gezinirsiniz; bir şey yazmanız gerektiğinde bot bunu söyler.\n\n' +
        '<b>Komutlar</b>\n' +
        '/menu — ana menü\n' +
        '/idx — bu sohbetin ve sizin kimliğiniz\n' +
        '/iptal — yarım kalan işlemi bırak\n\n' +
        'Yapabilecekleriniz: müşteri arayıp bakiye ve ekstre görmek, tahsilat ' +
        'girmek, borç kapatmak, cariye elle borç/alacak eklemek, stok sorgulamak, ' +
        'borçlu ve kâr-zarar raporlarını almak, şifreli yedeği tetiklemek.',
      keyboard: [[{ text: '⬅️ Ana menü', data: 'home' }]],
    };
  }

  // ── Cari ────────────────────────────────────────────────────────────
  /** Müşteri arama istemi — sonrasında yazılan metin arama terimi olur. */
  cariPrompt(chatId: number): Screen {
    this.sessions.patch(chatId, { awaiting: 'customer-search' });
    return {
      text:
        '<b>👥 Müşteri ara</b>\n' +
        'Aramak istediğiniz müşterinin adını, firmasını ya da telefonunu yazın.',
      keyboard: [
        [{ text: '🔴 Borçlular', data: 'rep:debt' }],
        [{ text: '⬅️ Ana menü', data: 'home' }],
      ],
    };
  }

  /** Arama sonuçları — her müşteri bir düğme. */
  async customerResults(term: string): Promise<Screen> {
    const found = await this.customers.findAll({
      search: term,
      page: 1,
      limit: PAGE,
      skip: 0,
    } as never);
    if (!found.items.length) {
      return {
        text: `“${esc(term)}” için müşteri bulunamadı. Yeniden aramak için adı yazın.`,
        keyboard: [[{ text: '⬅️ Ana menü', data: 'home' }]],
      };
    }
    return {
      text: `<b>“${esc(term)}”</b> için ${found.meta.total} sonuç. Birini seçin:`,
      keyboard: [
        ...found.items.map((c) => [
          {
            text: `${c.name} · ${money.format(Number(c.currentBalance))}`,
            data: `cst:${c.id}`,
          },
        ]),
        [
          { text: '🔍 Yeni arama', data: 'cari' },
          { text: '⬅️ Ana menü', data: 'home' },
        ],
      ],
    };
  }

  /** Müşteri kartı: güncel borç + son hareketler + işlem düğmeleri. */
  async customerCard(customerId: string): Promise<Screen> {
    const customer = await this.customers.findOne(customerId);
    const statement = await this.customers.getStatement(customerId);
    const balance = Number(customer.currentBalance);

    const lines = statement.entries.slice(-5).map((e) => {
      const sign = e.entryType === LedgerEntryType.DEBIT ? '➕' : '➖';
      const date = new Date(e.occurredAt).toLocaleDateString('tr-TR');
      return `${sign} ${date} · ${money.format(Number(e.amount))} — ${esc(
        e.description ?? e.sourceType,
      )}`;
    });

    const period =
      statement.scope === 'since-settlement' && statement.lastSettledAt
        ? `Son borç kapatma: ${new Date(statement.lastSettledAt).toLocaleDateString('tr-TR')}`
        : 'Tüm hareketler';

    return {
      text:
        `<b>${esc(customer.name)}</b>\n` +
        (customer.companyName ? `${esc(customer.companyName)}\n` : '') +
        (customer.phone ? `📞 ${esc(customer.phone)}\n` : '') +
        `\n<b>Güncel bakiye: ${money.format(balance)}</b>` +
        (balance > 0 ? ' (borçlu)' : balance < 0 ? ' (alacaklı)' : '') +
        `\n\n<i>${period}</i>\n` +
        (lines.length ? lines.join('\n') : 'Bu dönemde hareket yok.'),
      keyboard: [
        [
          { text: '💰 Tahsilat al', data: `pay:${customerId}` },
          ...(balance > 0
            ? [{ text: '🧾 Borcu kapat', data: `set:${customerId}` }]
            : []),
        ],
        [
          { text: '➕ Borç ekle', data: `led:d:${customerId}` },
          { text: '➖ Alacak ekle', data: `led:c:${customerId}` },
        ],
        [{ text: '📄 Ekstre (tümü)', data: `ext:${customerId}` }],
        [
          { text: '🔍 Yeni arama', data: 'cari' },
          { text: '⬅️ Ana menü', data: 'home' },
        ],
      ],
    };
  }

  /** Tüm hareketleri içeren ekstre özeti. */
  async statement(customerId: string): Promise<Screen> {
    const customer = await this.customers.findOne(customerId);
    const statement = await this.customers.getStatement(customerId, {
      scope: 'all',
    });
    const rows = statement.entries.slice(-20).map((e) => {
      const date = new Date(e.occurredAt).toLocaleDateString('tr-TR');
      const kind = e.entryType === LedgerEntryType.DEBIT ? 'Borç ' : 'Ödeme';
      return `${date} ${kind} ${money.format(Number(e.amount))} → ${money.format(
        Number(e.balanceAfter),
      )}`;
    });
    return {
      text:
        `<b>${esc(customer.name)} — ekstre</b>\n` +
        `Toplam ${statement.entries.length} hareket` +
        (statement.entries.length > 20 ? ' (son 20 gösteriliyor)' : '') +
        `\n\n<pre>${esc(rows.join('\n') || 'Hareket yok.')}</pre>\n` +
        `<b>Bakiye: ${money.format(statement.closingBalance)}</b>`,
      keyboard: [
        [{ text: '⬅️ Müşteri kartı', data: `cst:${customerId}` }],
        [{ text: '⬅️ Ana menü', data: 'home' }],
      ],
    };
  }

  // ── Tahsilat akışı ──────────────────────────────────────────────────
  async paymentAmountPrompt(chatId: number, customerId: string): Promise<Screen> {
    const customer = await this.customers.findOne(customerId);
    this.sessions.patch(chatId, {
      awaiting: 'payment-amount',
      data: { customerId },
    });
    return {
      text:
        `<b>💰 Tahsilat — ${esc(customer.name)}</b>\n` +
        `Güncel borç: ${money.format(Number(customer.currentBalance))}\n\n` +
        'Tahsil edilen tutarı yazın (örn. <code>1500</code> veya <code>1500,50</code>).',
      keyboard: [[{ text: '↩️ Vazgeç', data: `cst:${customerId}` }]],
    };
  }

  /** Tutar alındı → ödeme yöntemi seçimi. */
  methodPrompt(amount: number): Screen {
    return {
      text:
        `Tutar: <b>${money.format(amount)}</b>\n\nÖdeme yöntemini seçin:`,
      keyboard: [
        [
          { text: '💵 Nakit', data: 'pm:cash' },
          { text: '🏦 Havale/EFT', data: 'pm:bank_transfer' },
          { text: '💳 Kart', data: 'pm:card' },
        ],
        [{ text: '↩️ Vazgeç', data: 'home' }],
      ],
    };
  }

  /** Nakitte parayı teslim alan çalışan seçilir (iş kuralı gereği zorunlu). */
  async employeePrompt(): Promise<Screen> {
    const staff = (await this.users.findAll()).filter((u) => u.isActive);
    if (!staff.length) {
      return {
        text: 'Kayıtlı çalışan yok. Nakit tahsilat için önce çalışan tanımlayın.',
        keyboard: [[{ text: '⬅️ Ana menü', data: 'home' }]],
      };
    }
    return {
      text: 'Parayı <b>teslim alan çalışanı</b> seçin:',
      keyboard: [
        ...staff.map((u) => [
          {
            text: `${u.fullName}${u.role === UserRole.OWNER ? ' (sahip)' : ''}`,
            data: `emp:${u.id}`,
          },
        ]),
        [{ text: '↩️ Vazgeç', data: 'home' }],
      ],
    };
  }

  /** Havalede paranın yatırıldığı banka hesabı seçilir. */
  async bankPrompt(): Promise<Screen> {
    const accounts = await this.banks.findAll();
    if (!accounts.length) {
      return {
        text: 'Kayıtlı banka hesabı yok. Havale tahsilatı için önce hesap tanımlayın.',
        keyboard: [[{ text: '⬅️ Ana menü', data: 'home' }]],
      };
    }
    return {
      text: 'Paranın yatırıldığı <b>banka hesabını</b> seçin:',
      keyboard: [
        ...accounts.map((b) => [
          { text: `${b.bankName}${b.iban ? ` · ${b.iban}` : ''}`, data: `bnk:${b.id}` },
        ]),
        [{ text: '↩️ Vazgeç', data: 'home' }],
      ],
    };
  }

  /** Kaydetmeden önceki son onay ekranı. */
  async paymentConfirm(chatId: number): Promise<Screen> {
    const { data } = this.sessions.get(chatId);
    const customer = await this.customers.findOne(data.customerId);
    const amount = Number(data.amount);
    const method = data.method as PaymentMethod;
    const extra = data.receivedById
      ? (await this.users.findOne(data.receivedById)).fullName
      : data.bankAccountId
        ? (await this.banks.findOne(data.bankAccountId)).bankName
        : '';
    const closing = data.closeDebt === '1';
    return {
      text:
        '<b>Onay</b>\n\n' +
        `Müşteri: ${esc(customer.name)}\n` +
        `Tutar: <b>${money.format(amount)}</b>\n` +
        `Yöntem: ${METHOD_LABEL[method]}${extra ? ` · ${esc(extra)}` : ''}\n` +
        (closing ? 'Kalan borç <b>indirimle kapatılacak</b>.\n' : '') +
        `\nMevcut borç: ${money.format(Number(customer.currentBalance))}`,
      keyboard: [
        [{ text: '✅ Kaydet', data: 'payok' }],
        [{ text: '↩️ Vazgeç', data: `cst:${data.customerId}` }],
      ],
    };
  }

  /** Tahsilatı kaydeder ve sonucu döner. */
  async paymentSave(chatId: number): Promise<Screen> {
    const { data } = this.sessions.get(chatId);
    const customerId = data.customerId;
    const result = await this.payments.create(customerId, {
      amount: Number(data.amount),
      method: data.method as PaymentMethod,
      receivedById: data.receivedById || undefined,
      bankAccountId: data.bankAccountId || undefined,
      closeDebt: data.closeDebt === '1',
      note: 'Telegram üzerinden kaydedildi',
    } as never);
    this.sessions.reset(chatId);
    const customer = await this.customers.findOne(customerId);
    return {
      text:
        '✅ <b>Tahsilat kaydedildi.</b>\n\n' +
        `${esc(customer.name)}\n` +
        `Tutar: ${money.format(Number(data.amount))}\n` +
        `<b>Kalan bakiye: ${money.format(result.currentBalance)}</b>`,
      keyboard: [
        [{ text: '👤 Müşteri kartı', data: `cst:${customerId}` }],
        [{ text: '⬅️ Ana menü', data: 'home' }],
      ],
    };
  }

  // ── Borç kapatma ────────────────────────────────────────────────────
  async settlePrompt(chatId: number, customerId: string): Promise<Screen> {
    const customer = await this.customers.findOne(customerId);
    const balance = Number(customer.currentBalance);
    this.sessions.patch(chatId, { data: { customerId }, awaiting: undefined });
    return {
      text:
        `<b>🧾 Borç kapatma — ${esc(customer.name)}</b>\n` +
        `Güncel borç: <b>${money.format(balance)}</b>\n\n` +
        'Borcun tamamını tahsil mi ediyorsunuz, yoksa bir kısmını alıp ' +
        'kalanını indirim olarak mı kapatacaksınız?',
      keyboard: [
        [{ text: `💰 Tamamını tahsil et (${money.format(balance)})`, data: 'setfull' }],
        [{ text: '✂️ Bir kısmını al, kalanı indirim', data: 'setpart' }],
        [{ text: '🎁 Para almadan kapat (tamamı indirim)', data: 'setfree' }],
        [{ text: '↩️ Vazgeç', data: `cst:${customerId}` }],
      ],
    };
  }

  /** Bir carinin güncel bakiyesi ("tamamını tahsil et" tutarını belirler). */
  async customerBalance(customerId: string): Promise<number> {
    const customer = await this.customers.findOne(customerId);
    return Number(customer.currentBalance);
  }

  /** Para alınmadan borç kapatma — geri alınabilir ama yine de onay ister. */
  async settleFreeConfirm(chatId: number): Promise<Screen> {
    const { data } = this.sessions.get(chatId);
    const customer = await this.customers.findOne(data.customerId);
    return {
      text:
        '⚠️ <b>Onay</b>\n\n' +
        `${esc(customer.name)} carisinde ` +
        `<b>${money.format(Number(customer.currentBalance))}</b> borç, hiç para ` +
        'alınmadan <b>indirimle</b> kapatılacak.\n\nDevam edilsin mi?',
      keyboard: [
        [{ text: '✅ Evet, kapat', data: 'setfreeok' }],
        [{ text: '↩️ Vazgeç', data: `cst:${data.customerId}` }],
      ],
    };
  }

  async settleFree(chatId: number): Promise<Screen> {
    const { data } = this.sessions.get(chatId);
    const customerId = data.customerId;
    const customer = await this.customers.settleDebt(customerId, {
      paidAmount: 0,
      note: 'Telegram üzerinden borç kapatma',
    } as never);
    this.sessions.reset(chatId);
    return {
      text:
        '✅ <b>Borç kapatıldı.</b>\n\n' +
        `${esc(customer.name)}\n` +
        `Yeni bakiye: <b>${money.format(Number(customer.currentBalance))}</b>`,
      keyboard: [
        [{ text: '👤 Müşteri kartı', data: `cst:${customerId}` }],
        [{ text: '⬅️ Ana menü', data: 'home' }],
      ],
    };
  }

  // ── Cariye elle borç / alacak ───────────────────────────────────────
  async ledgerPrompt(
    chatId: number,
    customerId: string,
    entryType: LedgerEntryType,
  ): Promise<Screen> {
    const customer = await this.customers.findOne(customerId);
    this.sessions.patch(chatId, {
      awaiting: 'ledger-amount',
      data: { customerId, entryType },
    });
    const isDebit = entryType === LedgerEntryType.DEBIT;
    return {
      text:
        `<b>${isDebit ? '➕ Borç ekle' : '➖ Alacak ekle'} — ${esc(customer.name)}</b>\n` +
        `Güncel bakiye: ${money.format(Number(customer.currentBalance))}\n\n` +
        `Tutarı yazın${isDebit ? '' : ' (bu tutar borçtan düşülecek)'}.`,
      keyboard: [[{ text: '↩️ Vazgeç', data: `cst:${customerId}` }]],
    };
  }

  async ledgerSave(chatId: number, amount: number): Promise<Screen> {
    const { data } = this.sessions.get(chatId);
    const customerId = data.customerId;
    const customer = await this.customers.addLedgerEntry(customerId, {
      entryType: data.entryType as LedgerEntryType,
      amount,
      description: 'Telegram üzerinden eklendi',
    } as never);
    this.sessions.reset(chatId);
    return {
      text:
        '✅ <b>Hareket eklendi.</b>\n\n' +
        `${esc(customer.name)}\n` +
        `Yeni bakiye: <b>${money.format(Number(customer.currentBalance))}</b>`,
      keyboard: [
        [{ text: '👤 Müşteri kartı', data: `cst:${customerId}` }],
        [{ text: '⬅️ Ana menü', data: 'home' }],
      ],
    };
  }

  // ── Stok ────────────────────────────────────────────────────────────
  async stockMenu(): Promise<Screen> {
    const cats = await this.categories.findAll();
    return {
      text: '<b>📦 Stok</b>\nBir ürün türü seçin ya da arama yapın.',
      keyboard: [
        ...cats
          .slice(0, 12)
          .map((c) => [{ text: c.name, data: `stk:c:${c.id}:0` }]),
        [{ text: '🔍 Malzeme ara', data: 'stk:find' }],
        [{ text: '⬅️ Ana menü', data: 'home' }],
      ],
    };
  }

  stockSearchPrompt(chatId: number): Screen {
    this.sessions.patch(chatId, { awaiting: 'stock-search' });
    return {
      text: '<b>🔍 Malzeme ara</b>\nAramak istediğiniz malzemenin adını yazın.',
      keyboard: [[{ text: '⬅️ Stok menüsü', data: 'stk' }]],
    };
  }

  /** Kategori içi ya da arama sonucu stok listesi (sayfalı). */
  async stockList(opts: {
    categoryId?: string;
    search?: string;
    page: number;
  }): Promise<Screen> {
    const result = await this.plates.findAll({
      categoryId: opts.categoryId,
      search: opts.search,
      inStock: true,
      page: opts.page + 1,
      limit: PAGE,
      skip: opts.page * PAGE,
    } as never);

    const lines = result.items.map((plate) => {
      // findAll, listeye sahip adlarını (konsinye) iliştirir.
      const p = plate as typeof plate & { owners?: string[] };
      const owners = p.owners?.length ? p.owners.join(', ') : 'İşletme';
      const qty = Number(p.quantityInStock);
      const unit = p.measurementType === 'length' ? 'm' : 'adet';
      return `• <b>${esc(p.name)}</b>\n   ${qty} ${unit} · ${esc(owners)}`;
    });

    const pages = Math.max(1, Math.ceil(result.meta.total / PAGE));
    const nav: Keyboard[number] = [];
    if (opts.page > 0) {
      nav.push({ text: '⬅️ Önceki', data: this.stockNav(opts, opts.page - 1) });
    }
    if (opts.page + 1 < pages) {
      nav.push({ text: 'Sonraki ➡️', data: this.stockNav(opts, opts.page + 1) });
    }

    return {
      text:
        `<b>📦 Stok</b> — ${result.meta.total} kayıt (sayfa ${opts.page + 1}/${pages})\n\n` +
        (lines.join('\n') || 'Bu filtrede stok yok.'),
      keyboard: [
        ...(nav.length ? [nav] : []),
        [
          { text: '⬅️ Stok menüsü', data: 'stk' },
          { text: '⬅️ Ana menü', data: 'home' },
        ],
      ],
    };
  }

  /** Sayfalama düğmesinin veri dizesi (arama terimi oturumda tutulur). */
  private stockNav(
    opts: { categoryId?: string; search?: string },
    page: number,
  ): string {
    return opts.categoryId ? `stk:c:${opts.categoryId}:${page}` : `stk:s:${page}`;
  }

  // ── Raporlar ────────────────────────────────────────────────────────
  reportMenu(): Screen {
    return {
      text: '<b>📊 Raporlar</b>',
      keyboard: [
        [{ text: '🔴 En borçlu müşteriler', data: 'rep:debt' }],
        [{ text: '🟢 Alacaklılar (sahipler)', data: 'rep:cred' }],
        [{ text: '💹 Kâr-zarar (bu ay)', data: 'rep:pl' }],
        [{ text: '⬅️ Ana menü', data: 'home' }],
      ],
    };
  }

  async topDebtors(): Promise<Screen> {
    const list = await this.reports.topDebtors(10);
    const total = list.reduce((s, c) => s + Number(c.currentBalance), 0);
    return {
      text:
        '<b>🔴 En borçlu müşteriler</b>\n\n' +
        (list
          .map(
            (c, i) =>
              `${i + 1}. ${esc(c.name)} — <b>${money.format(Number(c.currentBalance))}</b>`,
          )
          .join('\n') || 'Borçlu müşteri yok.') +
        (list.length ? `\n\nToplam: <b>${money.format(total)}</b>` : ''),
      keyboard: [
        ...list.slice(0, 6).map((c) => [
          { text: `👤 ${c.name}`, data: `cst:${c.id}` },
        ]),
        [
          { text: '⬅️ Raporlar', data: 'rep' },
          { text: '⬅️ Ana menü', data: 'home' },
        ],
      ],
    };
  }

  async topCreditors(): Promise<Screen> {
    const list = await this.reports.topCreditors(10);
    return {
      text:
        '<b>🟢 Alacaklılar</b> (işletmenin borçlu olduğu)\n\n' +
        (list
          .map(
            (c, i) =>
              `${i + 1}. ${esc(c.name)} — <b>${money.format(
                Math.abs(Number(c.currentBalance)),
              )}</b>`,
          )
          .join('\n') || 'Alacaklı yok.'),
      keyboard: [
        ...list.slice(0, 6).map((c) => [
          { text: `👤 ${c.name}`, data: `cst:${c.id}` },
        ]),
        [
          { text: '⬅️ Raporlar', data: 'rep' },
          { text: '⬅️ Ana menü', data: 'home' },
        ],
      ],
    };
  }

  async profitLoss(): Promise<Screen> {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const pl = await this.reports.profitLoss(from, now);
    const row = (label: string, value: number) =>
      `${label}: <b>${money.format(value)}</b>`;
    return {
      text:
        `<b>💹 Kâr-zarar</b>\n${from.toLocaleDateString('tr-TR')} — ${now.toLocaleDateString('tr-TR')}\n\n` +
        [
          row('Gelir', Number(pl.income ?? 0)),
          row('Gider', Number(pl.expense ?? 0)),
          row('Net', Number(pl.net ?? 0)),
        ].join('\n'),
      keyboard: [
        [
          { text: '⬅️ Raporlar', data: 'rep' },
          { text: '⬅️ Ana menü', data: 'home' },
        ],
      ],
    };
  }

  // ── Yedek ───────────────────────────────────────────────────────────
  async backupMenu(): Promise<Screen> {
    const state = await this.backups.getState();
    return {
      text:
        '<b>🗄️ Yedek</b>\n\n' +
        (state
          ? `Bugünkü mesajda ${state.entries.length} yedek var (${state.dayKey}).`
          : 'Bugün için henüz yedek gönderilmedi.') +
        '\n\nŞifreli yedeği şimdi almak ve sohbete göndermek için düğmeye basın.',
      keyboard: [
        [{ text: '📤 Şifreli yedeği gönder', data: 'bkp:send' }],
        [{ text: '⬅️ Ana menü', data: 'home' }],
      ],
    };
  }

  async backupSend(): Promise<Screen> {
    const result = await this.backups.runAndSend('manual');
    return {
      text:
        '✅ <b>Yedek gönderildi.</b>\n' +
        `${result.action === 'created' ? 'Yeni günlük mesaj oluşturuldu' : 'Günlük mesaj güncellendi'} · ` +
        `bugünün ${result.entryCount}. yedeği.`,
      keyboard: [
        [
          { text: '⬅️ Yedek', data: 'bkp' },
          { text: '⬅️ Ana menü', data: 'home' },
        ],
      ],
    };
  }
}

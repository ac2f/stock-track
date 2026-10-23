import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { LedgerEntryType } from '../../common/enums/ledger-entry-type.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { SettingsService } from '../settings/settings.service';
import { ShopAccessService } from '../shops/shop-access.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../../common/enums/user-role.enum';
import { ShopContext } from '../../common/shop/shop-context';
import type { ShopModule, ShopPermissions } from '../../common/shop/shop-permissions';
import {
  Keyboard,
  TelegramApiService,
  TelegramUpdate,
} from './telegram-api.service';
import { Screen, TelegramScreensService } from './telegram-screens.service';
import { TelegramSessionService } from './telegram-session.service';

/** Kaç ms'de bir yeni mesaj/düğme olayı sorulur. */
const POLL_MS = 2000;

/**
 * Telegram kullanıcısının botta girebildiği dükkânlar. Kimliği bir
 * StockTrack hesabına yazılıysa (Ekip ekranı) o kişinin üyelikleri ve
 * izinleri geçer; yalnız sistemin yetkili listesindeyse (sistem sahibinin
 * eklediği kişi) bütün açık dükkânlar, tam yetkiyle.
 */
export interface BotAccess {
  /** Hesaba bağlı: izinler uygulanır. */
  linked: boolean;
  isOwner: boolean;
  shops: { id: string; name: string; permissions?: ShopPermissions }[];
}

/** Düğmenin gerektirdiği izin (hesaba bağlı kullanıcıda denetlenir). */
const NEEDS: Record<string, [ShopModule, 'read' | 'write']> = {
  cari: ['customers', 'read'],
  cst: ['customers', 'read'],
  ext: ['payments', 'read'],
  pay: ['payments', 'write'],
  pm: ['payments', 'write'],
  emp: ['payments', 'write'],
  bnk: ['payments', 'write'],
  payok: ['payments', 'write'],
  set: ['payments', 'write'],
  setfull: ['payments', 'write'],
  setpart: ['payments', 'write'],
  setfree: ['payments', 'write'],
  setfreeok: ['payments', 'write'],
  led: ['payments', 'write'],
  stk: ['stock', 'read'],
  rep: ['reports', 'read'],
};

/** Yazılı girdi beklenen adımın gerektirdiği izin. */
const AWAIT_NEEDS: Record<string, [ShopModule, 'read' | 'write']> = {
  'customer-search': ['customers', 'read'],
  'stock-search': ['stock', 'read'],
  'payment-amount': ['payments', 'write'],
  'settle-amount': ['payments', 'write'],
  'ledger-amount': ['payments', 'write'],
};

/**
 * Telegram arayüzünün beyni: olayları çeker, GÖNDERENİ DOĞRULAR, ekranlara
 * yönlendirir.
 *
 * Güvenlik: her mesaj ve her düğme basışı, işlenmeden önce ayarlardaki yetkili
 * kullanıcı listesine karşı denetlenir. Liste boşken hiç kimse yetkili değildir;
 * bot yalnızca kişiye kendi kullanıcı kimliğini söyler (hiçbir veri sızmaz,
 * hiçbir işlem yapılmaz) ki sahip onu arayüzden listeye ekleyebilsin.
 *
 * Bu servis tek getUpdates tüketicisidir — Telegram aynı jeton için birden çok
 * tüketiciye izin vermez (409 Conflict).
 */
@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly enabled: boolean;
  /** Bir sonraki istenecek update_id; null → imleç henüz kurulmadı. */
  private offset: number | null = null;
  private polling = false;
  private conflictLogged = false;
  /**
   * İşlenen olayın göndereninin erişimi. Olaylar sırayla işlenir (tek
   * tüketici, `polling` kilidi), bu yüzden tek alan yeter.
   */
  private access: BotAccess | null = null;

  constructor(
    private readonly api: TelegramApiService,
    private readonly screens: TelegramScreensService,
    private readonly sessions: TelegramSessionService,
    private readonly settings: SettingsService,
    private readonly shopAccess: ShopAccessService,
    configService: ConfigService,
    private readonly users?: UsersService,
  ) {
    this.enabled = configService.get<boolean>('scheduler.enabled') ?? true;
  }

  @Interval(POLL_MS)
  async poll(): Promise<void> {
    if (!this.enabled || this.polling) return;
    if (!(await this.api.token())) return;

    this.polling = true;
    try {
      // İlk turda yalnızca imleci kur: sunucu kapalıyken biriken komutlar
      // işlenmez (yeniden başlatmada eski isteklere toplu yanıt olmasın).
      if (this.offset === null) {
        const last = await this.api.getUpdates(-1);
        this.offset = last.length ? last[last.length - 1].update_id + 1 : 0;
        return;
      }

      const updates = await this.api.getUpdates(this.offset);
      this.conflictLogged = false;
      for (const update of updates) {
        this.offset = update.update_id + 1;
        await this.handle(update).catch((err) =>
          this.logger.warn(`Telegram olayı işlenemedi: ${(err as Error).message}`),
        );
      }
      this.sessions.sweep();
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('409')) {
        if (!this.conflictLogged) {
          this.logger.warn(
            `Telegram güncellemeleri okunamıyor (başka bir tüketici/webhook etkin): ${message}`,
          );
          this.conflictLogged = true;
        }
      } else {
        this.logger.debug(`Telegram getUpdates başarısız: ${message}`);
      }
    } finally {
      this.polling = false;
    }
  }

  // ── Olay dağıtımı ───────────────────────────────────────────────────
  private async handle(update: TelegramUpdate): Promise<void> {
    const callback = update.callback_query;
    const message = update.message;

    const fromId = callback?.from.id ?? message?.from?.id;
    const chatId = callback?.message?.chat.id ?? message?.chat.id;
    if (!fromId || !chatId) return;

    const text = message?.text?.trim() ?? '';

    // /idx her zaman çalışır: kimlik söyler, HİÇBİR iş verisine dokunmaz.
    // Yetkilendirmenin başlayabilmesi için gerekli (kişi kendi kimliğini
    // öğrenmeden listeye eklenemez).
    if (/^\/idx(@[\w_]+)?$/i.test(text)) {
      await this.sendIdentity(chatId, fromId, update);
      return;
    }

    // ⛔ Yetki denetimi — bundan sonrası yalnızca hesabına Telegram kimliği
    // yazılmış kullanıcılara ve sistemin yetkili listesindekilere.
    const access = await this.accessFor(fromId);
    if (!access) {
      if (callback) await this.api.answerCallback(callback.id, 'Yetkiniz yok.');
      await this.denyAccess(chatId, fromId);
      return;
    }
    this.access = access;

    // Sohbetin dükkânı: seçilmişse o (hâlâ girebiliyorsa), yoksa ilki.
    // Bundan sonraki her okuma/yazma o dükkânın bağlamında yapılır.
    const shopId = this.shopFor(chatId, access, callback?.data);
    if (!shopId) {
      if (callback) await this.api.answerCallback(callback.id);
      await this.api.sendMessage(
        chatId,
        access.linked ? 'Girebildiğiniz açık bir dükkân yok.' : 'Açık bir dükkân yok.',
      );
      return;
    }

    await ShopContext.forShop(shopId, async () => {
      if (callback) {
        await this.api.answerCallback(callback.id);
        await this.route(
          chatId,
          callback.data ?? 'home',
          callback.message?.message_id,
        );
        return;
      }

      if (!text) return;
      await this.handleText(chatId, text);
    });
  }

  /**
   * Gönderenin erişimi: hesabına yazılmış Telegram kimliği önce gelir
   * (üyelikler ve izinler), sonra sistemin yetkili listesi (bütün açık
   * dükkânlar). İkisi de değilse null.
   */
  private async accessFor(fromId: number): Promise<BotAccess | null> {
    const user = await this.users?.findByTelegramId(String(fromId));
    if (user) {
      const shops = (await this.shopAccess.listFor({ id: user.id, role: user.role })).filter(
        (s) => s.isActive,
      );
      return {
        linked: true,
        isOwner: user.role === UserRole.OWNER,
        shops: shops.map((s) => ({ id: s.id, name: s.name, permissions: s.permissions })),
      };
    }
    if (await this.settings.isUserAllowed(fromId)) {
      const shops = await this.shopAccess.activeShops();
      return { linked: false, isOwner: true, shops: shops.map((s) => ({ id: s.id, name: s.name })) };
    }
    return null;
  }

  /** Hesaba bağlı kullanıcı bu dükkânda bu işi yapabilir mi? */
  private can(need: [ShopModule, 'read' | 'write'] | undefined): boolean {
    const a = this.access;
    if (!need || !a || !a.linked || a.isOwner) return true;
    const shop = a.shops.find((s) => s.id === ShopContext.shopId());
    return !!shop?.permissions?.[need[0]]?.[need[1]];
  }

  /** Ana menü: dükkân satırı yalnız birden çok dükkâna girebilene. */
  private home(): Promise<Screen> {
    return this.screens.home(this.access?.shops);
  }

  private noPermission(): Screen {
    return {
      text: '⛔ Bu dükkânda bu işlem için izniniz yok. İzinleri dükkân yöneticisi Ekip ekranından verir.',
      keyboard: [[{ text: '⬅️ Ana menü', data: 'home' }]],
    };
  }

  /**
   * Sohbetin dükkânı, kişinin girebildikleri arasından. "shop:<id>" düğmesi
   * seçimi değiştirir; tek dükkânı olan hep onu görür.
   */
  private shopFor(chatId: number, access: BotAccess, data?: string): string | undefined {
    const shops = access.shops;
    const picked = data?.startsWith('shop:') ? data.slice(5) : undefined;
    if (picked && shops.some((s) => s.id === picked)) {
      this.sessions.setShop(chatId, picked);
      this.sessions.reset(chatId);
      return picked;
    }
    const current = this.sessions.shopOf(chatId);
    if (current && shops.some((s) => s.id === current)) return current;
    const first = shops[0]?.id;
    if (first) {
      this.sessions.setShop(chatId, first);
      // Önceki seçim artık girilemeyen bir dükkândaydı: yarım akış kalmasın.
      if (current) this.sessions.reset(chatId);
    }
    return first;
  }

  /** Yetkisiz kişiye: ne yapıldığı ve kendi kimliği (veri sızmaz). */
  private async denyAccess(chatId: number, userId: number): Promise<void> {
    const allowed = await this.settings.getAllowedUserIds();
    await this.api.sendMessage(
      chatId,
      allowed.length
        ? '⛔ <b>Yetkiniz yok.</b>\n\n' +
            `Kullanıcı kimliğiniz: <code>${userId}</code>\n` +
            'Dükkân yöneticinizden bu kimliği web arayüzünde <i>Ekip</i> ekranında ' +
            'hesabınıza yazmasını isteyin (yalnız sizin dükkânlarınızı görürsünüz) ya da ' +
            'işletme sahibinden <i>Ayarlar › Telegram › Yetkili kullanıcılar</i> listesine eklemesini.'
        : '⚠️ <b>Yetkili kullanıcı listesi boş.</b>\n\n' +
            `Kullanıcı kimliğiniz: <code>${userId}</code>\n` +
            'Bu kimliği web arayüzünde <i>Ayarlar › Telegram › Yetkili kullanıcılar</i> ' +
            'alanına ekleyin; sonra buradan işlem yapabilirsiniz.',
    );
  }

  /** /idx — sohbet ve kullanıcı kimliği (mobilde dokunarak kopyalanır). */
  private async sendIdentity(
    chatId: number,
    userId: number,
    update: TelegramUpdate,
  ): Promise<void> {
    const chat = update.message?.chat ?? update.callback_query?.message?.chat;
    const isGroup = chat && chat.type !== 'private';
    const name = chat?.title ?? 'bu sohbet';
    const allowed = !!(await this.accessFor(userId));
    await this.api.sendMessage(
      chatId,
      `🆔 <b>${TelegramApiService.escape(name)}</b>\n\n` +
        `${isGroup ? 'Grup' : 'Sohbet'} kimliği: <code>${chatId}</code>\n` +
        `Sizin kullanıcı kimliğiniz: <code>${userId}</code>\n\n` +
        (allowed
          ? '✅ Bu hesap işlem yapmaya yetkili. /menu ile başlayın.'
          : '⛔ Bu hesap henüz yetkili değil. Kullanıcı kimliğini web arayüzünde ' +
            '<i>Ekip</i> ekranında kişinin hesabına ya da ' +
            '<i>Ayarlar › Telegram › Yetkili kullanıcılar</i> alanına yazın.'),
    );
  }

  // ── Metin girdileri (çok adımlı akışlar) ────────────────────────────
  private async handleText(chatId: number, text: string): Promise<void> {
    if (/^\/(start|menu)(@[\w_]+)?$/i.test(text)) {
      this.sessions.reset(chatId);
      return this.show(chatId, await this.home());
    }
    if (/^\/iptal(@[\w_]+)?$/i.test(text)) {
      this.sessions.reset(chatId);
      return this.show(chatId, await this.home());
    }
    if (/^\/yardim(@[\w_]+)?$/i.test(text)) {
      return this.show(chatId, this.screens.help());
    }

    const session = this.sessions.get(chatId);
    if (session.awaiting && !this.can(AWAIT_NEEDS[session.awaiting])) {
      this.sessions.reset(chatId);
      return this.show(chatId, this.noPermission());
    }
    switch (session.awaiting) {
      case 'customer-search':
        this.sessions.clearAwaiting(chatId);
        return this.show(chatId, await this.screens.customerResults(text));

      case 'stock-search':
        this.sessions.patch(chatId, {
          awaiting: undefined,
          data: { stockSearch: text },
        });
        return this.show(
          chatId,
          await this.screens.stockList({ search: text, page: 0 }),
        );

      case 'payment-amount': {
        const amount = this.parseAmount(text);
        if (amount == null) return this.invalidAmount(chatId);
        this.sessions.patch(chatId, {
          awaiting: undefined,
          data: { amount: String(amount) },
        });
        return this.show(chatId, this.screens.methodPrompt(amount));
      }

      case 'settle-amount': {
        const amount = this.parseAmount(text);
        if (amount == null) return this.invalidAmount(chatId);
        // Kısmi borç kapatma: tahsil edilen tutar + kalan fark indirim.
        this.sessions.patch(chatId, {
          awaiting: undefined,
          data: { amount: String(amount), closeDebt: '1' },
        });
        return this.show(chatId, this.screens.methodPrompt(amount));
      }

      case 'ledger-amount': {
        const amount = this.parseAmount(text);
        if (amount == null) return this.invalidAmount(chatId);
        return this.show(chatId, await this.screens.ledgerSave(chatId, amount));
      }

      default:
        // Menüde beklenen bir girdi yoksa yönlendir.
        return this.show(chatId, await this.home());
    }
  }

  /** "1.500,50" / "1500.5" gibi girdileri sayıya çevirir. */
  private parseAmount(text: string): number | null {
    const normalized = text
      .replace(/[^\d.,-]/g, '')
      .replace(/\.(?=\d{3}\b)/g, '')
      .replace(',', '.');
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100) / 100;
  }

  private async invalidAmount(chatId: number): Promise<void> {
    await this.api.sendMessage(
      chatId,
      '⚠️ Tutarı anlayamadım. Sadece sayı yazın — örn. <code>1500</code> ya da <code>1500,50</code>.',
    );
  }

  // ── Düğme yönlendirmesi ─────────────────────────────────────────────
  private async route(
    chatId: number,
    data: string,
    messageId?: number,
  ): Promise<void> {
    const [head, ...rest] = data.split(':');
    if (!this.can(NEEDS[head]) || (head === 'bkp' && this.access?.linked && !this.access.isOwner)) {
      return this.show(chatId, this.noPermission(), messageId);
    }

    switch (head) {
      case 'home':
        this.sessions.reset(chatId);
        return this.show(chatId, await this.home(), messageId);
      case 'shops':
        return this.show(chatId, await this.screens.shopPicker(this.access?.shops), messageId);
      case 'shop':
        // Seçim shopFor'da yapıldı; yeni dükkânın ana menüsü.
        return this.show(chatId, await this.home(), messageId);
      case 'help':
        return this.show(chatId, this.screens.help(), messageId);

      // Cari
      case 'cari':
        return this.show(chatId, this.screens.cariPrompt(chatId), messageId);
      case 'cst':
        return this.show(
          chatId,
          await this.screens.customerCard(rest[0]),
          messageId,
        );
      case 'ext':
        return this.show(chatId, await this.screens.statement(rest[0]), messageId);

      // Tahsilat
      case 'pay':
        return this.show(
          chatId,
          await this.screens.paymentAmountPrompt(chatId, rest[0]),
          messageId,
        );
      case 'pm': {
        const method = rest[0] as PaymentMethod;
        this.sessions.patch(chatId, { data: { method } });
        if (method === PaymentMethod.CASH) {
          return this.show(chatId, await this.screens.employeePrompt(), messageId);
        }
        if (method === PaymentMethod.BANK_TRANSFER) {
          return this.show(chatId, await this.screens.bankPrompt(), messageId);
        }
        return this.show(
          chatId,
          await this.screens.paymentConfirm(chatId),
          messageId,
        );
      }
      case 'emp':
        this.sessions.patch(chatId, { data: { receivedById: rest[0] } });
        return this.show(
          chatId,
          await this.screens.paymentConfirm(chatId),
          messageId,
        );
      case 'bnk':
        this.sessions.patch(chatId, { data: { bankAccountId: rest[0] } });
        return this.show(
          chatId,
          await this.screens.paymentConfirm(chatId),
          messageId,
        );
      case 'payok':
        return this.show(chatId, await this.screens.paymentSave(chatId), messageId);

      // Borç kapatma
      case 'set':
        return this.show(
          chatId,
          await this.screens.settlePrompt(chatId, rest[0]),
          messageId,
        );
      case 'setfull': {
        // Borcun tamamı tahsil ediliyor → tutar carinin bakiyesidir.
        const { data: sd } = this.sessions.get(chatId);
        const customer = await this.screens.customerBalance(sd.customerId);
        this.sessions.patch(chatId, {
          data: { amount: String(customer), closeDebt: '1' },
        });
        return this.show(chatId, this.screens.methodPrompt(customer), messageId);
      }
      case 'setpart':
        this.sessions.patch(chatId, { awaiting: 'settle-amount' });
        return this.show(
          chatId,
          {
            text:
              'Tahsil ettiğiniz tutarı yazın. Kalan fark <b>indirim</b> olarak ' +
              'yazılacak ve borç kapanacak.',
            keyboard: [[{ text: '↩️ Vazgeç', data: 'home' }]],
          },
          messageId,
        );
      case 'setfree':
        return this.show(
          chatId,
          await this.screens.settleFreeConfirm(chatId),
          messageId,
        );
      case 'setfreeok':
        return this.show(chatId, await this.screens.settleFree(chatId), messageId);

      // Cariye elle hareket
      case 'led':
        return this.show(
          chatId,
          await this.screens.ledgerPrompt(
            chatId,
            rest[1],
            rest[0] === 'd' ? LedgerEntryType.DEBIT : LedgerEntryType.CREDIT,
          ),
          messageId,
        );

      // Stok
      case 'stk': {
        if (!rest.length) {
          return this.show(chatId, await this.screens.stockMenu(), messageId);
        }
        if (rest[0] === 'find') {
          return this.show(
            chatId,
            this.screens.stockSearchPrompt(chatId),
            messageId,
          );
        }
        if (rest[0] === 'c') {
          return this.show(
            chatId,
            await this.screens.stockList({
              categoryId: rest[1],
              page: Number(rest[2]) || 0,
            }),
            messageId,
          );
        }
        if (rest[0] === 's') {
          const { data: sd } = this.sessions.get(chatId);
          return this.show(
            chatId,
            await this.screens.stockList({
              search: sd.stockSearch,
              page: Number(rest[1]) || 0,
            }),
            messageId,
          );
        }
        return this.show(chatId, await this.screens.stockMenu(), messageId);
      }

      // Raporlar
      case 'rep': {
        if (rest[0] === 'debt') {
          return this.show(chatId, await this.screens.topDebtors(), messageId);
        }
        if (rest[0] === 'cred') {
          return this.show(chatId, await this.screens.topCreditors(), messageId);
        }
        if (rest[0] === 'pl') {
          return this.show(chatId, await this.screens.profitLoss(), messageId);
        }
        return this.show(chatId, this.screens.reportMenu(), messageId);
      }

      // Yedek
      case 'bkp':
        if (rest[0] === 'send') {
          return this.show(chatId, await this.screens.backupSend(), messageId);
        }
        return this.show(chatId, await this.screens.backupMenu(), messageId);

      default:
        return this.show(chatId, await this.home(), messageId);
    }
  }

  /**
   * Ekranı gösterir. Düğmeden gelindiyse mevcut mesajı YERİNDE günceller →
   * sohbet menü mesajlarıyla dolmaz; aksi halde yeni mesaj gönderir.
   */
  private async show(
    chatId: number,
    screen: Screen,
    messageId?: number,
  ): Promise<void> {
    const keyboard: Keyboard = screen.keyboard;
    if (messageId) {
      await this.api.editMessage(chatId, messageId, screen.text, keyboard);
      return;
    }
    await this.api.sendMessage(chatId, screen.text, keyboard);
  }
}

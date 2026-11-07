import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ShopContext } from '../../../common/shop/shop-context';
import { maskPhone, normalizePhone } from '../../../common/utils/phone.util';
import { Customer } from '../entities/customer.entity';

export type DebtBucket = '0-30' | '31-60' | '61-90' | '90+';

/**
 * Başka bir işletmedeki borç UYARISI. Tutar bilerek YOKTUR: yalnız hangi
 * işletmeye, ne zamandır borç olduğu bilinir.
 */
export interface DebtWarning {
  shopName: string;
  /** En eski ödenmemiş borcun tarihi. */
  since: string;
  /** Bugünden o güne gün sayısı. */
  ageDays: number;
  bucket: DebtBucket;
  /** Ödenmemiş borç kalemi sayısı (tutar değil). */
  openItems: number;
}

export interface CustomerSuggestion {
  name: string;
  companyName: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  /** Bu telefonla kaç farklı işletmede kayıt var (kendiniz hariç). */
  sources: number;
}

export interface PhoneLookupResult {
  /** Karşılaştırılan biçim (905321234567); telefon eşleştirmeye elverişsizse null. */
  phone: string | null;
  /** Bu işletmede aynı telefonla kayıtlı müşteri (tekrar kayıt uyarısı). */
  own: { id: string; name: string } | null;
  suggestion: CustomerSuggestion | null;
  debtWarnings: DebtWarning[];
  /** Bu işletmenin ağa katılımı: kapalıysa ilgili bilgiler gelmez (karşılıklılık). */
  network: { customerInfo: boolean; debtInfo: boolean };
}

const DAY = 86_400_000;

export function bucketOf(ageDays: number): DebtBucket {
  if (ageDays <= 30) return '0-30';
  if (ageDays <= 60) return '31-60';
  if (ageDays <= 90) return '61-90';
  return '90+';
}

/**
 * İşletmeler arası müşteri ağı. Aynı TELEFON numarasıyla:
 *  1. Başka bir işletmede kayıtlı müşterinin ad/iletişim bilgisi öneri olarak
 *     gelir (kullanıcı değiştirebilir; bakiye, not, fiyat ASLA paylaşılmaz);
 *  2. O numara başka bir işletmeye borçluysa bir UYARI gösterilir: hangi işletme
 *     ve borcun yaşı — tutar gizlidir.
 * Katılım karşılıklıdır: işletme ağı kapatırsa ne kendi bilgisi paylaşılır ne de
 * başkalarınınkini görür (Ayarlar › İşletme profili).
 */
@Injectable()
export class CustomerNetworkService {
  private readonly logger = new Logger(CustomerNetworkService.name);

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Müşteri formunda telefon yazılınca: öneri + uyarılar. */
  async lookup(rawPhone: string): Promise<PhoneLookupResult> {
    const shopId = ShopContext.requireShopId();
    const phone = normalizePhone(rawPhone);
    const network = await this.participation(shopId);
    const empty: PhoneLookupResult = { phone, own: null, suggestion: null, debtWarnings: [], network };
    if (!phone) return empty;

    const own = await this.customers.findOne({ where: { phoneNormalized: phone }, select: { id: true, name: true } });
    const [suggestion, debtWarnings] = await Promise.all([
      network.customerInfo ? this.suggestionFor(phone, shopId) : null,
      network.debtInfo ? this.warningsFor(phone, shopId) : [],
    ]);
    this.logger.log(
      `Müşteri ağı sorgusu: dükkân ${shopId.slice(0, 8)} kullanıcı ${(ShopContext.current()?.userId ?? '?').slice(0, 8)} ` +
        `tel ${maskPhone(phone)} → öneri ${suggestion ? suggestion.sources : 0}, uyarı ${debtWarnings.length}`,
    );
    return { phone, own: own ? { id: own.id, name: own.name } : null, suggestion, debtWarnings, network };
  }

  /** Kayıtlı bir müşterinin başka işletmelerdeki borç uyarıları (müşteri kartı için). */
  async warningsForCustomer(customerId: string): Promise<{ debtWarnings: DebtWarning[]; network: { customerInfo: boolean; debtInfo: boolean } }> {
    const shopId = ShopContext.requireShopId();
    const customer = await this.customers.findOne({ where: { id: customerId }, select: { id: true, phoneNormalized: true } });
    if (!customer) throw new NotFoundException('Müşteri bulunamadı.');
    const network = await this.participation(shopId);
    if (!customer.phoneNormalized || !network.debtInfo) return { debtWarnings: [], network };
    return { debtWarnings: await this.warningsFor(customer.phoneNormalized, shopId), network };
  }

  // ── İç ───────────────────────────────────────────────────────────────

  private async participation(shopId: string): Promise<{ customerInfo: boolean; debtInfo: boolean }> {
    const rows: { share_customer_info: boolean; share_debt_info: boolean }[] = await this.dataSource.query(
      `SELECT share_customer_info, share_debt_info FROM shops WHERE id = $1 AND deleted_at IS NULL`,
      [shopId],
    );
    if (!rows[0]) throw new BadRequestException('İşletme bulunamadı.');
    return { customerInfo: rows[0].share_customer_info, debtInfo: rows[0].share_debt_info };
  }

  private async suggestionFor(phone: string, shopId: string): Promise<CustomerSuggestion | null> {
    // Başka işletmelerde (etkin, bilgi paylaşan) aynı telefonla kayıtlı müşteriler; en son güncellenen önde.
    const rows: {
      shop_id: string;
      name: string;
      company_name: string | null;
      email: string | null;
      address: string | null;
      tax_number: string | null;
    }[] = await this.dataSource.query(
      `SELECT c.shop_id, c.name, c.company_name, c.email, c.address, c.tax_number
         FROM customers c
         JOIN shops s ON s.id = c.shop_id AND s.deleted_at IS NULL AND s.is_active
                     AND s.status = 'active' AND s.share_customer_info
        WHERE c.phone_normalized = $1 AND c.shop_id <> $2 AND c.deleted_at IS NULL
          AND btrim(c.name) <> ''
        ORDER BY c.updated_at DESC
        LIMIT 20`,
      [phone, shopId],
    );
    if (!rows.length) return null;
    const best = rows[0];
    return {
      name: best.name,
      companyName: best.company_name,
      email: best.email,
      address: best.address,
      taxNumber: best.tax_number,
      sources: new Set(rows.map((r) => r.shop_id)).size,
    };
  }

  private async warningsFor(phone: string, shopId: string): Promise<DebtWarning[]> {
    // Aynı telefonla, başka bir işletmede borcu olan (bakiye > 0) müşteriler.
    const debtors: { id: string; shop_id: string; shop_name: string; created_at: Date }[] = await this.dataSource.query(
      `SELECT c.id, c.shop_id, s.name AS shop_name, c.created_at
         FROM customers c
         JOIN shops s ON s.id = c.shop_id AND s.deleted_at IS NULL AND s.is_active
                     AND s.status = 'active' AND s.share_debt_info
        WHERE c.phone_normalized = $1 AND c.shop_id <> $2 AND c.deleted_at IS NULL
          AND c.current_balance > 0`,
      [phone, shopId],
    );
    if (!debtors.length) return [];

    // Her müşterinin ödenmemiş borç kalemleri: ödemeler en eski borca uygulanır (yaşlandırma
    // raporuyla aynı yöntem). Yalnız TARİHLER okunur; tutarlar sorgudan dışarı çıkmaz.
    const open: { customer_id: string; occurred_at: Date }[] = await this.dataSource.query(
      `WITH l AS (
         SELECT e.id, e.customer_id, e.entry_type, e.amount, e.occurred_at
           FROM customer_ledger_entries e
          WHERE e.customer_id = ANY($1) AND e.deleted_at IS NULL
       ),
       credit AS (SELECT customer_id, SUM(amount) AS total FROM l WHERE entry_type = 'credit' GROUP BY customer_id),
       debit AS (
         SELECT customer_id, occurred_at,
                SUM(amount) OVER (PARTITION BY customer_id ORDER BY occurred_at, id
                                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
           FROM l WHERE entry_type = 'debit'
       )
       SELECT d.customer_id, d.occurred_at
         FROM debit d LEFT JOIN credit cr ON cr.customer_id = d.customer_id
        WHERE d.running - COALESCE(cr.total, 0) > 0
        ORDER BY d.customer_id, d.occurred_at`,
      [debtors.map((d) => d.id)],
    );
    const byCustomer = new Map<string, Date[]>();
    for (const r of open) byCustomer.set(r.customer_id, [...(byCustomer.get(r.customer_id) ?? []), new Date(r.occurred_at)]);

    const now = Date.now();
    const perShop = new Map<string, { name: string; since: Date; items: number }>();
    for (const d of debtors) {
      const dates = byCustomer.get(d.id) ?? [];
      // Defterde açık kalem yoksa (açılış bakiyesi) borç, müşterinin kayıt tarihinden beri sayılır.
      const since = dates.length ? dates[0] : new Date(d.created_at);
      const cur = perShop.get(d.shop_id);
      if (!cur) perShop.set(d.shop_id, { name: d.shop_name, since, items: dates.length });
      else {
        if (since < cur.since) cur.since = since;
        cur.items += dates.length;
      }
    }
    return [...perShop.values()]
      .map<DebtWarning>((v) => {
        const ageDays = Math.max(0, Math.floor((now - v.since.getTime()) / DAY));
        return { shopName: v.name, since: v.since.toISOString(), ageDays, bucket: bucketOf(ageDays), openItems: v.items };
      })
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 5);
  }
}

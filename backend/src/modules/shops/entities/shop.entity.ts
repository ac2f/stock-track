import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Hesabın (işletmenin) durumu.
 *  - pending   : kayıt oldu, platform yöneticisi onaylayana kadar sisteme girilemez
 *  - active    : kullanımda
 *  - suspended : yönetici askıya aldı (ödeme, kural ihlali ...); girilemez
 */
export type ShopStatus = 'pending' | 'active' | 'suspended';

/**
 * Dükkân (şube / ayrı işletme). Deposu, müşterileri, teklifleri, ödemeleri
 * ve ayarları diğer dükkânlardan bağımsızdır. Silinmez; kapatılır.
 *
 * Sistem birden çok işletmeye KİRALANIR: her işletme kendi boş dükkânıyla
 * başlar (kayıt akışı) ve yalnız kendi verisini görür. Rehber alanları
 * (il/ilçe, iletişim, etiketler, makineler) işletmelerin birbirini bulmasını sağlar.
 */
@Entity('shops')
export class Shop extends BaseEntity {
  @Column()
  name: string;

  /** Kapalı dükkâna yalnız sistem sahibi girebilir. */
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // ── Kiralama ────────────────────────────────────────────────────────

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: ShopStatus;

  /** Kiralama planının adı (serbest metin: "deneme", "standart" ...). */
  @Column({ type: 'varchar', length: 40, default: 'standard' })
  plan: string;

  /**
   * Kiralamanın son günü (dahil). Geçince hesap SALT OKUNUR olur (veriler
   * görülür, yazılamaz); boşsa süresiz.
   */
  @Column({ name: 'subscription_until', type: 'date', nullable: true })
  subscriptionUntil?: string | null;

  /** Platform yöneticisinin bu işletme için notu (işletme görmez). */
  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote?: string | null;

  // ── İşletme profili (rehberde görünür) ───────────────────────────────

  @Column({ name: 'legal_name', type: 'varchar', length: 160, nullable: true })
  legalName?: string | null;

  @Column({ name: 'contact_person', type: 'varchar', length: 120, nullable: true })
  contactPerson?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  website?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 60, nullable: true })
  province?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 80, nullable: true })
  district?: string | null;

  @Column({ name: 'address_line', type: 'varchar', length: 300, nullable: true })
  addressLine?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** İşletme diğer işletmelerin rehberinde listelensin mi? */
  @Index()
  @Column({ name: 'directory_visible', default: false })
  directoryVisible: boolean;

  /**
   * Varsayılan KAPALI (mevcut dükkânlar izinsiz paylaşıma girmez); yeni kayıtlarda
   * kayıt akışı açık başlatır, işletme profilinden değiştirir.
   *
   * "Borç uyarı ağı": açıksa bu işletmenin borçlu müşterileri başka işletmelerde
   * AYNI TELEFONLA kayıt edilirken (tutar OLMADAN) uyarı olarak görünür; ve bu
   * işletme de diğerlerinin uyarılarını görür (karşılıklılık).
   */
  @Column({ name: 'share_debt_info', default: false })
  shareDebtInfo: boolean;

  /**
   * "Müşteri bilgisi ağı": açıksa aynı telefonla yeni müşteri kaydederken diğer
   * işletmelere ad/iletişim bilgisi öneri olarak sunulur (bakiye/not ASLA paylaşılmaz).
   */
  @Column({ name: 'share_customer_info', default: false })
  shareCustomerInfo: boolean;
}

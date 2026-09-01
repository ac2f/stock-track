import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';

/** Bir banka hareketinin uygulamadaki karşılığı bulundu mu? */
export enum BankTxStatus {
  /** Henüz eşleştirilmedi — mutabakat kuyruğunda bekliyor. */
  UNMATCHED = 'unmatched',
  /** Bir tahsilat/ödeme ya da gider kaydıyla eşleştirildi. */
  MATCHED = 'matched',
  /** Kasıtlı olarak dışarıda bırakıldı (ör. hesaplar arası virman). */
  IGNORED = 'ignored',
}

/** Hareketin eşleştiği kayıt türü. */
export enum BankTxMatchType {
  PAYMENT = 'payment',
  EXPENSE = 'expense',
}

/**
 * Bankadan gelen tek bir hesap hareketi.
 *
 * Kaynak ne olursa olsun (ekstre dosyası, kurumsal API, elle giriş) hareketler
 * BURAYA yazılır; eşleştirme ve mutabakat tek bir modelin üzerinde çalışır.
 * Böylece ileride banka API'si devreye girdiğinde yalnızca içe aktarma katmanı
 * değişir, mutabakat mantığı aynı kalır.
 *
 * `fingerprint`, aynı ekstrenin iki kez yüklenmesini engeller: banka bir
 * referans numarası veriyorsa ondan, vermiyorsa hesap + tarih + tutar +
 * açıklamadan üretilir.
 */
@Entity('bank_transactions')
@Unique(['bankAccountId', 'fingerprint'])
@Index(['bankAccountId', 'transactionDate'])
@Index(['status'])
export class BankTransaction extends BaseEntity {
  @ManyToOne(() => BankAccount, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount;

  @Column({ name: 'bank_account_id' })
  bankAccountId: string;

  /** Aynı hareketin tekrar yüklenmesini önleyen benzersiz iz. */
  @Column()
  fingerprint: string;

  /** Bankanın kendi referans/dekont numarası (varsa). */
  @Column({ name: 'external_id', nullable: true })
  externalId?: string;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: string;

  /**
   * İşaretli tutar: POZİTİF = hesaba giriş (tahsilat), NEGATİF = çıkış (gider).
   * Banka ekstrelerindeki ayrı borç/alacak sütunları içe aktarmada bu tek
   * işaretli alana indirgenir — eşleştirme yönü buradan anlaşılır.
   */
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  /** Ekstredeki ham açıklama — eşleştirme ipuçları buradan çıkarılır. */
  @Column({ type: 'text', default: '' })
  description: string;

  /** Karşı taraf adı (ekstre veriyorsa) — müşteri/tedarikçi tahmininde kullanılır. */
  @Column({ name: 'counterparty_name', nullable: true })
  counterpartyName?: string;

  @Column({ name: 'counterparty_iban', nullable: true })
  counterpartyIban?: string;

  /** Hareket sonrası hesap bakiyesi (ekstre veriyorsa). */
  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  balanceAfter?: number | null;

  @Column({ type: 'enum', enum: BankTxStatus, default: BankTxStatus.UNMATCHED })
  status: BankTxStatus;

  @Column({
    name: 'match_type',
    type: 'enum',
    enum: BankTxMatchType,
    nullable: true,
  })
  matchType?: BankTxMatchType | null;

  /** Eşleştirilen kaydın kimliği (ödeme ya da gider). */
  @Column({ name: 'match_id', type: 'uuid', nullable: true })
  matchId?: string | null;

  /** Eşleştirmeyi kimin onayladığı — denetim izi. */
  @Column({ name: 'matched_by_id', type: 'uuid', nullable: true })
  matchedById?: string | null;

  @Column({ name: 'matched_at', type: 'timestamptz', nullable: true })
  matchedAt?: Date | null;

  /** Ekstredeki ham satır — sorun çıkarsa kaynağa dönebilmek için. */
  @Column({ name: 'raw_row', type: 'jsonb', default: {} })
  rawRow: Record<string, unknown>;

  /** Aynı yüklemede gelen hareketleri gruplayan kimlik. */
  @Column({ name: 'import_batch_id', type: 'uuid', nullable: true })
  importBatchId?: string | null;
}

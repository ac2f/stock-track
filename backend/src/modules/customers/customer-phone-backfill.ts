import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { normalizePhone } from '../../common/utils/phone.util';

const logger = new Logger('CustomerPhoneBackfill');

/**
 * Telefonu olup `phone_normalized` değeri henüz hesaplanmamış müşterileri
 * doldurur (işletmeler arası eşleşme bu sütunla yapılır). Her açılışta çalışır,
 * tekrarı zararsızdır; eşleştirmeye elverişsiz (çok kısa) numaralar boş kalır.
 */
export async function backfillCustomerPhones(dataSource: DataSource): Promise<number> {
  let done = 0;
  let lastId = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows: { id: string; phone: string }[] = await dataSource.query(
      `SELECT id, phone FROM customers
        WHERE phone IS NOT NULL AND btrim(phone) <> '' AND phone_normalized IS NULL AND id > $1
        ORDER BY id LIMIT 500`,
      [lastId],
    );
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;
    const pairs = rows
      .map((r) => ({ id: r.id, n: normalizePhone(r.phone) }))
      .filter((r): r is { id: string; n: string } => !!r.n);
    if (pairs.length) {
      await dataSource.query(
        `UPDATE customers c SET phone_normalized = v.n
           FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS n) v
          WHERE c.id = v.id`,
        [pairs.map((p) => p.id), pairs.map((p) => p.n)],
      );
      done += pairs.length;
    }
  }
  if (done) logger.log(`${done} müşterinin telefonu eşleşme biçimine çevrildi.`);
  return done;
}

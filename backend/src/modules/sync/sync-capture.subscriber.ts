import {
  EntitySubscriberInterface,
  InsertEvent,
  ObjectLiteral,
} from 'typeorm';
import { ShopContext } from '../../common/shop/shop-context';

/** Belge numarası taşıyan alanlar → tablo (yeniden oynatmada korunur). */
const DOC_NO_FIELDS: Record<string, string> = {
  quotes: 'quoteNo',
  shop_transfers: 'transferNo',
};

/**
 * Eşitleme için kayıt eklemelerini izler (docs/SYNC.md § Kimlikler):
 *
 *  - YENİDEN OYNATMA (merkez): replikanın o işlemde açtığı kimlikler tablo
 *    başına sırayla yeni kayıtlara verilir; böylece yerelde açılan teklif,
 *    müşteri, satış merkezde de AYNI kimlikle olur (Corel klasörü, bağlantılar,
 *    sonraki işlemler bozulmaz). Kimlik doluysa (çakışma) dokunulmaz. Kaydın
 *    oluşturulma zamanı da işlemin asıl zamanı olur.
 *  - Her iki tarafta: istekte eklenen kayıtlar (ve belge numaraları) sırasıyla
 *    not edilir — giden kutusuna ve yeniden oynatma yanıtına yazılır.
 */
export class SyncCaptureSubscriber implements EntitySubscriberInterface {
  async beforeInsert(event: InsertEvent<ObjectLiteral>): Promise<void> {
    const sync = ShopContext.current()?.sync;
    const replay = sync?.replay;
    const entity = event.entity;
    if (!replay || !entity) return;
    const table = event.metadata.tableName;
    const queue = replay.clientIds[table];
    const idColumn = event.metadata.primaryColumns[0];
    if (queue?.length && idColumn?.propertyName === 'id' && !entity.id) {
      const candidate = queue.shift()!;
      if (ShopContext.isUuid(candidate)) {
        const rows: unknown[] = await event.manager.query(
          `SELECT 1 FROM "${table}" WHERE "id" = $1`,
          [candidate],
        );
        if (!rows.length) entity.id = candidate;
      }
    }
    if (replay.occurredAt && event.metadata.createDateColumn && entity.createdAt == null) {
      entity.createdAt = new Date(replay.occurredAt.getTime());
    }
  }

  afterInsert(event: InsertEvent<ObjectLiteral>): void {
    const capture = ShopContext.current()?.sync?.capture;
    const entity = event.entity;
    if (!capture || !entity) return;
    const table = event.metadata.tableName;
    const id = entity.id ?? event.entityId;
    if (typeof id === 'string') capture.inserted.push({ table, id });
    const docField = DOC_NO_FIELDS[table];
    if (docField && typeof entity[docField] === 'string') capture.docNos[table] = entity[docField];
  }
}

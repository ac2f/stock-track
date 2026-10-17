import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { ShopContext } from '../../common/shop/shop-context';
import { ShopScopedEntity } from '../../common/shop/shop-scoped.entity';
import { legacyEmployeePermissions } from '../../common/shop/shop-permissions';
import { SystemSetting } from '../settings/entities/system-setting.entity';
import { User } from '../users/entities/user.entity';
import { ShopMember } from './entities/shop-member.entity';
import { Shop } from './entities/shop.entity';

const logger = new Logger('ShopMigration');

/**
 * Çok dükkâna geçiş — her açılışta çalışır, tekrar çalışması zararsızdır.
 *
 *  1. Hiç dükkân yoksa "ilk dükkân"ı açar (adı mevcut işletme adından).
 *  2. Dükkânı boş kalmış (geçişten önceki) her kaydı ilk dükkâna atar:
 *     stok, müşteri, teklif, ödeme, ayarlar ... hiçbir veri kaybolmaz.
 *  3. İlk geçişte mevcut çalışanları ilk dükkâna, eskiden sahip oldukları
 *     erişimle ekler (erişimleri değişmez). Sistem sahibi üyelik istemez.
 *  4. Telegram botu ve yedek sohbeti gibi sisteme ait ayarları ilk
 *     dükkânın ayar satırından sistem ayarlarına taşır.
 *
 * Şema senkronizasyonundan SONRA, herhangi bir istekten ÖNCE çağrılır.
 */
export async function migrateToShops(dataSource: DataSource): Promise<Shop> {
  return ShopContext.unscoped(async () => {
    const shopsRepo = dataSource.getRepository(Shop);
    let first = await shopsRepo.findOne({ where: {}, order: { createdAt: 'ASC' }, withDeleted: true });
    let created = false;
    if (!first) {
      const legacy: { business_name?: string }[] = await dataSource.query(
        `SELECT "business_name" FROM "app_settings" WHERE "deleted_at" IS NULL ORDER BY "created_at" ASC LIMIT 1`,
      );
      const name =
        legacy[0]?.business_name?.trim() || process.env.BUSINESS_NAME?.trim() || 'Ana Dükkân';
      first = await shopsRepo.save(shopsRepo.create({ name, isActive: true }));
      created = true;
      logger.log(`İlk dükkân açıldı: "${name}"`);
    }

    // 2) Dükkânsız kayıtlar → ilk dükkân.
    let moved = 0;
    for (const metadata of dataSource.entityMetadatas) {
      const target = metadata.target;
      if (typeof target !== 'function' || !(target.prototype instanceof ShopScopedEntity)) continue;
      const result: unknown = await dataSource.query(
        `UPDATE "${metadata.tableName}" SET "shop_id" = $1 WHERE "shop_id" IS NULL`,
        [first.id],
      );
      moved += affectedRows(result);
    }
    if (moved > 0) logger.log(`${moved} kayıt "${first.name}" dükkânına atandı.`);

    // 3) İlk geçişte çalışanlar → ilk dükkân.
    if (created) {
      const users = await dataSource.getRepository(User).find();
      const membersRepo = dataSource.getRepository(ShopMember);
      let added = 0;
      for (const user of users) {
        if (user.role === UserRole.OWNER) continue;
        const exists = await membersRepo.findOne({ where: { shopId: first.id, userId: user.id } });
        if (exists) continue;
        await membersRepo.save(
          membersRepo.create({
            shopId: first.id,
            userId: user.id,
            isAdmin: false,
            permissions: legacyEmployeePermissions(),
          }),
        );
        added += 1;
      }
      if (added) logger.log(`${added} çalışan "${first.name}" dükkânına eklendi.`);
    }

    // 4) Sisteme ait ayarlar.
    const systemRepo = dataSource.getRepository(SystemSetting);
    if (!(await systemRepo.findOne({ where: {} }))) {
      const legacy: {
        telegram_bot_token?: string;
        backup_telegram_chat_id?: string;
        telegram_allowed_user_ids?: string;
      }[] = await dataSource.query(
        `SELECT "telegram_bot_token", "backup_telegram_chat_id", "telegram_allowed_user_ids"
           FROM "app_settings" WHERE "shop_id" = $1 AND "deleted_at" IS NULL
          ORDER BY "created_at" ASC LIMIT 1`,
        [first.id],
      );
      await systemRepo.save(
        systemRepo.create({
          telegramBotToken: legacy[0]?.telegram_bot_token ?? '',
          backupTelegramChatId: legacy[0]?.backup_telegram_chat_id ?? '',
          telegramAllowedUserIds: legacy[0]?.telegram_allowed_user_ids ?? '',
        }),
      );
    }
    return first;
  });
}

/** TypeORM'un postgres `query()` UPDATE sonucu: [satırlar, etkilenen]. */
function affectedRows(result: unknown): number {
  if (Array.isArray(result) && typeof result[1] === 'number') return result[1];
  return 0;
}

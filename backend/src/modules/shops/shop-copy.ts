import { DataSource, EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { ShopContext } from '../../common/shop/shop-context';
import { ExpenseCategory } from '../expenses/entities/expense-category.entity';
import { MaterialBrand } from '../materials/entities/material-brand.entity';
import { MaterialCategoryEntity } from '../materials/entities/material-category.entity';
import { MaterialColor } from '../materials/entities/material-color.entity';
import { MaterialSize } from '../materials/entities/material-size.entity';
import { MaterialTemplate } from '../materials/entities/material-template.entity';
import { MaterialThickness } from '../materials/entities/material-thickness.entity';
import { Machine } from '../processing/entities/machine.entity';
import { ProcessingRate } from '../processing/entities/processing-rate.entity';
import { AppSetting } from '../settings/entities/app-setting.entity';

/**
 * Yeni dükkânı sıfırdan kurmak yerine bir dükkânın kataloğunu kopyalar.
 * Sıra önemlidir: önce türler, sonra türe bağlı marka/renk/ebat/kalınlık,
 * en son bunlara bağlı şablonlar. Kopyalarda kimlikler yenidir; kopyalanan
 * kayıtlar arasındaki bağlar (ör. şablon → tür) yeni kimliklere çevrilir.
 */
const CATALOG: EntityTarget<ObjectLiteral>[] = [
  MaterialCategoryEntity,
  MaterialBrand,
  MaterialColor,
  MaterialSize,
  MaterialThickness,
  MaterialTemplate,
  ProcessingRate,
  Machine,
  ExpenseCategory,
];

const SKIP_PROPS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'shopId']);

/** Bir satırın kopyası: kimliksiz, dükkânsız; kimlik eşlemesindeki bağlar çevrilmiş. */
function cloneRow(
  manager: EntityManager,
  target: EntityTarget<ObjectLiteral>,
  row: ObjectLiteral,
  idMap: Map<string, string>,
  omit: Set<string> = new Set(),
): ObjectLiteral {
  const metadata = manager.connection.getMetadata(target);
  const clone = manager.create(target, {});
  for (const column of metadata.columns) {
    if (SKIP_PROPS.has(column.propertyName) || omit.has(column.propertyName)) continue;
    if (column.isGenerated || column.relationMetadata && column.propertyName === column.relationMetadata.propertyName) continue;
    let value = column.getEntityValue(row);
    if (typeof value === 'string' && idMap.has(value)) value = idMap.get(value);
    column.setEntityValue(clone, value);
  }
  return clone;
}

export async function copyShopCatalog(
  dataSource: DataSource,
  fromShopId: string,
  toShopId: string,
): Promise<number> {
  const idMap = new Map<string, string>();
  let copied = 0;
  await dataSource.transaction(async (manager) => {
    for (const target of CATALOG) {
      const rows = await ShopContext.forShop(fromShopId, () =>
        manager.find(target, { order: { createdAt: 'ASC' } as never }),
      );
      await ShopContext.forShop(toShopId, async () => {
        for (const row of rows) {
          const saved = await manager.save(target, cloneRow(manager, target, row, idMap));
          idMap.set(row.id as string, saved.id as string);
          copied += 1;
        }
      });
    }
  });
  return copied;
}

/** Ayarların kopyası; dükkânın adı ve Corel anahtarı kopyalanmaz. */
export async function copyShopSettings(
  dataSource: DataSource,
  fromShopId: string,
  toShopId: string,
  businessName: string,
): Promise<void> {
  const manager = dataSource.manager;
  const source = await ShopContext.forShop(fromShopId, () =>
    manager.findOne(AppSetting, { where: {}, order: { createdAt: 'ASC' } }),
  );
  if (!source) return;
  await ShopContext.forShop(toShopId, async () => {
    const existing = await manager.findOne(AppSetting, { where: {} });
    if (existing) return;
    const clone = cloneRow(
      manager,
      AppSetting,
      source,
      new Map(),
      new Set(['businessName', 'corelApiKey']),
    ) as AppSetting;
    clone.businessName = businessName;
    clone.corelApiKey = '';
    await manager.save(AppSetting, clone);
  });
}

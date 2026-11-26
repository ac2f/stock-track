import { DataSource } from 'typeorm';
import { ShopScopedEntity } from './shop-scoped.entity';
import { PLAIN_REFERENCES } from './shop-scope.typeorm';

/**
 * Dükkâna bağlı her tablonun kimlik sütunu (`*_id`, uuid) dükkân denetiminden geçmeli: ya bir ilişkinin
 * (`@ManyToOne`) sütunudur (denetim ilişkiden yürür), ya PLAIN_REFERENCES'tadır, ya da dükkâna bağlı olmayan bir
 * şeyi gösterir (aşağıdaki liste). Yeni bir `xId` sütunu bu üçünden birine girmeden eklenirse bu test kırılır:
 * aksi halde başka dükkânın kaydına bağlanmak sessizce mümkün olurdu (B'nin markası A'nın türüne bağlanabiliyordu).
 */
const NOT_SHOP_RECORDS: Record<string, string[]> = {
  // kullanıcılar, dükkânlar, platform kayıtları, eşitleme/yığın kimlikleri, çok biçimli başvurular
  bank_transactions: ['import_batch_id', 'match_id', 'matched_by_id'],
  customers: ['linked_shop_id'],
  suppliers: ['linked_shop_id'],
  idempotency_keys: ['user_id'],
  machines: ['size_id'],
  replica_outbox: ['resolved_by_id', 'user_id'],
  shop_stock_shares: ['ref_id'],
  sync_changes: ['row_id'],
};

describe('dükkân başvuruları', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', entities: [__dirname + '/../../**/*.entity{.ts,.js}'] });
    await (ds as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  });

  it('her kimlik sütunu denetlenir ya da dükkâna bağlı olmayanı gösterir', () => {
    const scoped = ds.entityMetadatas.filter(
      (m) => typeof m.target === 'function' && m.target.prototype instanceof ShopScopedEntity,
    );
    expect(scoped.length).toBeGreaterThan(20);
    const unchecked: string[] = [];
    for (const m of scoped) {
      const joined = new Set(m.relations.flatMap((r) => r.joinColumns.map((c) => c.databaseName)));
      for (const c of m.columns) {
        const name = c.databaseName;
        if (!name.endsWith('_id') || name === 'shop_id' || c.type !== 'uuid' && !joined.has(name)) continue;
        if (joined.has(name)) continue;
        if (PLAIN_REFERENCES[m.tableName]?.[name]) continue;
        if (NOT_SHOP_RECORDS[m.tableName]?.includes(name)) continue;
        unchecked.push(`${m.tableName}.${name}`);
      }
    }
    expect(unchecked).toEqual([]);
  });

  it('PLAIN_REFERENCES yalnız dükkâna bağlı tabloları gösterir ve sütunlar gerçekten vardır', () => {
    const byTable = new Map(ds.entityMetadatas.map((m) => [m.tableName, m]));
    for (const [table, cols] of Object.entries(PLAIN_REFERENCES)) {
      const m = byTable.get(table)!;
      expect(m).toBeDefined();
      for (const [col, target] of Object.entries(cols)) {
        expect(m.findColumnWithDatabaseName(col)).toBeDefined();
        const t = byTable.get(target)!;
        expect(t && typeof t.target === 'function' && t.target.prototype instanceof ShopScopedEntity).toBe(true);
      }
    }
  });
});

describe('dükkân başvurusu denetimi (abone)', () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const CAT_OF_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const CAT_OF_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  let ds: DataSource;
  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', entities: [__dirname + '/../../**/*.entity{.ts,.js}'] });
    await (ds as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ShopScopeSubscriber } = require('./shop-scope.typeorm');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ShopContext } = require('./shop-context');
  const manager = {
    connection: { driver: { escape: (s: string) => `"${s}"` } },
    query: jest.fn(async (_sql: string, [id]: string[]) => [{ shop_id: id === CAT_OF_A ? A : B }]),
  };
  const event = (table: string, entity: Record<string, unknown>) => ({
    entity, manager, metadata: ds.entityMetadatas.find((m) => m.tableName === table)!,
  });

  it('B dükkânında A dükkânının türüne marka açılamaz, var olan marka A\'nın türüne taşınamaz', async () => {
    const sub = new ShopScopeSubscriber();
    await ShopContext.forShop(B, async () => {
      await expect(sub.beforeInsert(event('material_brands', { categoryId: CAT_OF_A, name: 'x' }))).rejects.toThrow(/Başka bir dükkân/);
      await expect(sub.beforeUpdate(event('material_brands', { shopId: B, categoryId: CAT_OF_A }))).rejects.toThrow(/Başka bir dükkân/);
      await expect(sub.beforeInsert(event('material_brands', { categoryId: CAT_OF_B, name: 'x' }))).resolves.toBeUndefined();
    });
  });

  it('yüklenmiş ilişki dururken değiştirilen kimlik de denetlenir', async () => {
    const sub = new ShopScopeSubscriber();
    await ShopContext.forShop(B, async () => {
      // (şablonun türü ilişkisi B'nin türünü gösterirken categoryId A'nınkine çevrilmiş)
      const entity = { shopId: B, category: { id: CAT_OF_B }, categoryId: CAT_OF_A };
      await expect(sub.beforeUpdate(event('material_templates', entity))).rejects.toThrow(/Başka bir dükkân/);
    });
  });
});

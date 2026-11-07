import { pairsForWrite, writtenTables } from './cache-invalidation';

const SHOP = '00000000-0000-4000-8000-000000000001';

describe('writtenTables — hangi SQL hangi tabloyu değiştirir', () => {
  it('TypeORM biçimli yazmaları tanır', () => {
    expect(writtenTables('INSERT INTO "customers"("id", "name") VALUES ($1, $2)')).toEqual(['customers']);
    expect(writtenTables('UPDATE "material_plates" SET "quantity_in_stock" = $1 WHERE "id" = $2')).toEqual(['material_plates']);
    expect(writtenTables('DELETE FROM "stock_levels" WHERE "plate_id" = $1')).toEqual(['stock_levels']);
    expect(writtenTables('TRUNCATE TABLE "sale_items"')).toEqual(['sale_items']);
  });

  it('elle yazılmış (tırnaksız, şemalı, küçük harfli) SQL de tanınır', () => {
    expect(writtenTables('update stock_levels set quantity = quantity - 1 where id = $1')).toEqual(['stock_levels']);
    expect(writtenTables('  INSERT INTO public.shops (name) VALUES ($1)')).toEqual(['shops']);
    expect(writtenTables('DELETE FROM ONLY "x_y" WHERE 1=1')).toEqual(['x_y']);
  });

  it('WITH ... (CTE) içindeki yazmaları bulur', () => {
    const sql = 'WITH moved AS (UPDATE "customers" SET "x" = 1 RETURNING id) INSERT INTO "customer_ledger_entries"(a) SELECT id FROM moved';
    expect(writtenTables(sql).sort()).toEqual(['customer_ledger_entries', 'customers']);
  });

  it('okumalar, işlem komutları ve DDL yazma sayılmaz', () => {
    for (const sql of [
      'SELECT * FROM "customers"',
      'SELECT "update" FROM t',
      'START TRANSACTION',
      'COMMIT',
      'SAVEPOINT typeorm_1',
      'ALTER TABLE "customers" ADD "x" int',
      'CREATE INDEX i ON t(a)',
      'WITH x AS (SELECT 1) SELECT * FROM x',
      '',
    ]) {
      expect(writtenTables(sql)).toEqual([]);
    }
  });
});

describe('pairsForWrite — hangi yazma hangi grupları siler', () => {
  it('dükkâna bağlı tablo: o dükkânın "shop" grubu + tabloya özel gruplar', () => {
    expect(pairsForWrite('material_brands', true, SHOP, false)).toEqual([
      [SHOP, 'shop'],
      [SHOP, 'catalog'],
    ]);
    expect(pairsForWrite('customers', true, SHOP, false)).toEqual([[SHOP, 'shop']]);
    expect(pairsForWrite('app_settings', true, SHOP, false)).toEqual([
      [SHOP, 'shop'],
      [SHOP, 'settings'],
    ]);
  });

  it('dükkân bağlamı yoksa ya da süzgeçsizse bütün dükkânlar silinir', () => {
    expect(pairsForWrite('customers', true, undefined, false)).toEqual([['*', 'shop']]);
    expect(pairsForWrite('customers', true, SHOP, true)).toEqual([['*', 'shop']]);
  });

  it('makine: dükkânın grubu + global rehber', () => {
    expect(pairsForWrite('machines', true, SHOP, false)).toEqual([
      [SHOP, 'shop'],
      ['g', 'directory'],
    ]);
  });

  it('global tablolar yalnız global grupları siler', () => {
    expect(pairsForWrite('shop_members', false, SHOP, false)).toEqual([['g', 'access']]);
    expect(pairsForWrite('users', false, undefined, false)).toEqual([
      ['g', 'users'],
      ['g', 'access'],
    ]);
    expect(pairsForWrite('shops', false, undefined, false)).toEqual([
      ['g', 'access'],
      ['g', 'directory'],
    ]);
  });

  it('sık yazılan ilgisiz tablolar önbelleği boşaltmaz', () => {
    for (const t of ['idempotency_keys', 'sync_changes', 'corel_runners', 'notifications']) {
      expect(pairsForWrite(t, true, SHOP, false)).toEqual([]);
    }
  });
});

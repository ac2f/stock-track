import { config as loadEnv } from 'dotenv';
import * as bcrypt from 'bcrypt';
import { IsNull } from 'typeorm';
import dataSource from '../config/typeorm.config';
import { User } from '../modules/users/entities/user.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { MeasurementType } from '../common/enums/measurement-type.enum';
import { ProcessingRate } from '../modules/processing/entities/processing-rate.entity';
import { Warehouse } from '../modules/warehouses/entities/warehouse.entity';
import { MaterialPlate } from '../modules/materials/entities/material-plate.entity';
import { MaterialCategoryEntity } from '../modules/materials/entities/material-category.entity';
import { StockLevel } from '../modules/materials/entities/stock-level.entity';

/** Örnek malzeme türleri — İşletme Sahibi bunları dilediği gibi düzenleyebilir/silebilir. */
const DEFAULT_MATERIAL_CATEGORIES: {
  name: string;
  code: string;
  defaultMeasurementType: MeasurementType;
}[] = [
  { name: 'Alüminyum', code: 'aluminum', defaultMeasurementType: MeasurementType.AREA },
  { name: 'Alüminyum Kompozit', code: 'aluminum_composite', defaultMeasurementType: MeasurementType.AREA },
  { name: 'Pleksi', code: 'plexiglass', defaultMeasurementType: MeasurementType.AREA },
  { name: 'Dekota', code: 'dekota', defaultMeasurementType: MeasurementType.AREA },
  { name: 'MDF', code: 'mdf', defaultMeasurementType: MeasurementType.AREA },
  { name: 'Forex', code: 'forex', defaultMeasurementType: MeasurementType.AREA },
  { name: 'Kutu Harf Rulosu/Şeridi', code: 'channel_letter_coil', defaultMeasurementType: MeasurementType.LENGTH },
  { name: 'Genel Rulo/Şerit', code: 'coil_strip', defaultMeasurementType: MeasurementType.LENGTH },
  { name: 'Diğer', code: 'other', defaultMeasurementType: MeasurementType.PIECE },
];

/**
 * İlk kurulum tohumlaması (idempotent).
 *  - İlk İşletme Sahibi (OWNER) hesabı (aksi halde kimse giriş yapamaz).
 *  - Varsayılan m² ve metre (kutu harf) işleme tarifeleri.
 *  - Varsayılan "Merkez Depo" + mevcut stoğun StockLevel'a backfill'i.
 *
 * Çalıştırma:  npm run seed
 */
async function seed(): Promise<void> {
  loadEnv();
  await dataSource.initialize();

  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@stocktrack.local';
  const password = process.env.SEED_OWNER_PASSWORD ?? 'Owner123!';
  const currency = process.env.DEFAULT_CURRENCY ?? 'TRY';
  const warehouseCode = process.env.DEFAULT_WAREHOUSE_CODE ?? 'MERKEZ';

  // ── OWNER ──
  const usersRepo = dataSource.getRepository(User);
  if (!(await usersRepo.findOne({ where: { email } }))) {
    await usersRepo.save(
      usersRepo.create({
        fullName: 'İşletme Sahibi',
        email,
        role: UserRole.OWNER,
        isActive: true,
        passwordHash: await bcrypt.hash(password, 10),
      }),
    );
    console.log(`✓ OWNER oluşturuldu: ${email} / ${password}`);
  } else {
    console.log(`• OWNER zaten mevcut: ${email}`);
  }

  // ── İşleme tarifeleri (m² ve metre) ──
  const ratesRepo = dataSource.getRepository(ProcessingRate);
  if (!(await ratesRepo.findOne({ where: { isDefault: true } }))) {
    await ratesRepo.save([
      ratesRepo.create({
        name: 'Standart Kesim (m²)',
        unit: MeasurementType.AREA,
        ratePerUnit: Number(process.env.DEFAULT_RATE_PER_M2 ?? 75),
        currency,
        isDefault: true,
        isActive: true,
      }),
      ratesRepo.create({
        name: 'Kutu Harf (metre)',
        unit: MeasurementType.LENGTH,
        ratePerUnit: 40,
        currency,
        isDefault: false,
        isActive: true,
      }),
    ]);
    console.log('✓ Varsayılan işleme tarifeleri (m² + metre) oluşturuldu.');
  }

  // ── Malzeme türleri (örnek; OWNER düzenleyebilir/silebilir) ──
  const categoriesRepo = dataSource.getRepository(MaterialCategoryEntity);
  let createdCategories = 0;
  for (const c of DEFAULT_MATERIAL_CATEGORIES) {
    if (!(await categoriesRepo.findOne({ where: { code: c.code } }))) {
      await categoriesRepo.save(categoriesRepo.create({ ...c, isActive: true }));
      createdCategories += 1;
    }
  }
  if (createdCategories > 0) {
    console.log(`✓ ${createdCategories} malzeme türü (örnek) oluşturuldu.`);
  }

  // ── Merkez Depo + stok backfill ──
  const warehousesRepo = dataSource.getRepository(Warehouse);
  let warehouse = await warehousesRepo.findOne({ where: { code: warehouseCode } });
  if (!warehouse) {
    warehouse = await warehousesRepo.save(
      warehousesRepo.create({ name: 'Merkez Depo', code: warehouseCode, isActive: true }),
    );
    console.log(`✓ "${warehouse.name}" (${warehouseCode}) oluşturuldu.`);
  }

  const platesRepo = dataSource.getRepository(MaterialPlate);
  const stockRepo = dataSource.getRepository(StockLevel);
  const plates = await platesRepo.find();
  let backfilled = 0;
  for (const plate of plates) {
    const qty = Number(plate.quantityInStock);
    if (qty <= 0) continue;
    const exists = await stockRepo.findOne({
      where: { plateId: plate.id, warehouseId: warehouse.id, ownerCustomerId: IsNull() },
    });
    if (!exists) {
      await stockRepo.save(
        stockRepo.create({
          plateId: plate.id,
          warehouseId: warehouse.id,
          ownerCustomerId: null,
          quantity: qty,
        }),
      );
      backfilled += 1;
    }
  }
  if (backfilled > 0) {
    console.log(`✓ ${backfilled} kalemin stoğu Merkez Depo'ya taşındı (backfill).`);
  }

  await dataSource.destroy();
  console.log('Tohumlama tamamlandı.');
}

seed().catch((err) => {
  console.error('Tohumlama hatası:', err);
  process.exit(1);
});

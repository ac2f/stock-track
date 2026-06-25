import { config as loadEnv } from 'dotenv';
import * as bcrypt from 'bcrypt';
import dataSource from '../config/typeorm.config';
import { User } from '../modules/users/entities/user.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { ProcessingRate } from '../modules/processing/entities/processing-rate.entity';

/**
 * İlk kurulum tohumlaması (idempotent).
 *  - İlk İşletme Sahibi (OWNER) hesabını oluşturur — aksi halde kimse giriş
 *    yapamaz (kullanıcı oluşturmak OWNER yetkisi ister).
 *  - Varsayılan bir m² işleme tarifesi ekler.
 *
 * Çalıştırma:  npm run seed
 * Kimlik:      SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD (.env) veya varsayılanlar.
 */
async function seed(): Promise<void> {
  loadEnv();
  await dataSource.initialize();

  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@stocktrack.local';
  const password = process.env.SEED_OWNER_PASSWORD ?? 'Owner123!';

  const usersRepo = dataSource.getRepository(User);
  const existing = await usersRepo.findOne({ where: { email } });
  if (!existing) {
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

  const ratesRepo = dataSource.getRepository(ProcessingRate);
  const hasDefault = await ratesRepo.findOne({ where: { isDefault: true } });
  if (!hasDefault) {
    await ratesRepo.save(
      ratesRepo.create({
        name: 'Standart İşleme',
        ratePerM2: Number(process.env.DEFAULT_RATE_PER_M2 ?? 75),
        currency: process.env.DEFAULT_CURRENCY ?? 'TRY',
        isDefault: true,
        isActive: true,
      }),
    );
    console.log('✓ Varsayılan m² işleme tarifesi oluşturuldu.');
  }

  await dataSource.destroy();
  console.log('Tohumlama tamamlandı.');
}

seed().catch((err) => {
  console.error('Tohumlama hatası:', err);
  process.exit(1);
});

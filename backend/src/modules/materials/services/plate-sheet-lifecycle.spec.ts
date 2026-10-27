import { BadRequestException } from '@nestjs/common';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import { MaterialPlate } from '../entities/material-plate.entity';
import { PlatesService } from './plates.service';

/**
 * Tabaka (AREA) yaşam döngüsü: her kayıt tek bir fiziksel tabakadır. Tükenen
 * tabakadan ikinci kez düşülemez (eşzamanlı satış), iptalde tabaka stok
 * seviyesiyle birlikte geri gelir.
 */
describe('PlatesService sheet lifecycle', () => {
  function build() {
    const config = { get: () => undefined };
    return new PlatesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      config as never,
    );
  }

  function plate(extra: Partial<MaterialPlate> = {}): MaterialPlate {
    return {
      id: 'p1',
      name: 'Pleksi 1000x2000',
      measurementType: MeasurementType.AREA,
      widthMm: 1000,
      heightMm: 2000,
      deletedAt: null,
      isActive: true,
      ...extra,
    } as unknown as MaterialPlate;
  }

  describe('consume', () => {
    it('tabaka satırını kilitleyerek okur', async () => {
      const service = build();
      const manager = { findOne: jest.fn(async () => null) };
      await service
        .consume({ plateId: 'p1', warehouseId: 'w', quantity: 1, manager: manager as never })
        .catch(() => undefined);
      const opts = (manager.findOne.mock.calls as unknown as unknown[][])[0][1] as Record<string, unknown>;
      expect(opts.lock).toEqual({ mode: 'pessimistic_write' });
      expect(opts.withDeleted).toBe(true);
    });

    it('tükenmiş (silinmiş) tabakadan düşmeyi reddeder', async () => {
      const service = build();
      const manager = { findOne: jest.fn(async () => plate({ deletedAt: new Date() })) };
      await expect(
        service.consume({ plateId: 'p1', warehouseId: 'w', quantity: 1, manager: manager as never }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ebadı sıfırlanmış tabakadan düşmeyi reddeder', async () => {
      const service = build();
      const manager = { findOne: jest.fn(async () => plate({ widthMm: 0 })) };
      await expect(
        service.consume({ plateId: 'p1', warehouseId: 'w', quantity: 1, manager: manager as never }),
      ).rejects.toThrow(/stokta kalmadı/);
    });
  });

  describe('restoreSheet', () => {
    function managerFor(p: MaterialPlate, levelsAfterRestore: unknown[]) {
      const levels = {
        restore: jest.fn(async () => undefined),
        find: jest.fn(async (arg: { where: Record<string, unknown> }) =>
          'ownerCustomerId' in arg.where ? levelsAfterRestore : levelsAfterRestore,
        ),
        save: jest.fn(async (x: unknown) => x),
        create: jest.fn((x: unknown) => x),
      };
      const manager = {
        findOne: jest.fn(async () => p),
        save: jest.fn(async (_e: unknown, x: unknown) => x),
        update: jest.fn(async () => undefined),
        getRepository: jest.fn(() => levels),
      };
      return { manager, levels };
    }

    it('tükenmiş tabakayı geri açar, seviyeyi 1 adetle döndürür ve önbelleği yazar', async () => {
      const service = build();
      const p = plate({ widthMm: 0, heightMm: 0, deletedAt: new Date(), isActive: false });
      const level = { plateId: 'p1', warehouseId: 'w', ownerCustomerId: null, quantity: 0 };
      const { manager, levels } = managerFor(p, [level]);
      await service.restoreSheet('p1', 1000, 2000, manager as never);
      expect(p.deletedAt).toBeNull();
      expect(p.isActive).toBe(true);
      expect(Number(p.widthMm)).toBe(1000);
      expect(Number(p.heightMm)).toBe(2000);
      expect(levels.restore).toHaveBeenCalledWith({ plateId: 'p1' });
      expect(level.quantity).toBe(1);
      expect(manager.update).toHaveBeenCalledWith(MaterialPlate, 'p1', { quantityInStock: 1 });
    });

    it('seviye kaydı yoksa yedek depo/sahiple yeni seviye açar', async () => {
      const service = build();
      const p = plate({ widthMm: 0, heightMm: 0, deletedAt: new Date() });
      const created: unknown[] = [];
      const { manager, levels } = managerFor(p, []);
      levels.create.mockImplementation((x: unknown) => {
        created.push(x);
        return x;
      });
      await service.restoreSheet('p1', 1000, 2000, manager as never, {
        warehouseId: 'w9',
        ownerCustomerId: 'c1',
      });
      expect(created).toEqual([
        { plateId: 'p1', warehouseId: 'w9', ownerCustomerId: 'c1', quantity: 1 },
      ]);
      expect(levels.save).toHaveBeenCalled();
    });

    it('silinmemiş tabakada yalnız ebat ekler, seviyelere dokunmaz', async () => {
      const service = build();
      const p = plate({ widthMm: 1000, heightMm: 1200 });
      const { manager, levels } = managerFor(p, []);
      await service.restoreSheet('p1', 0, 800, manager as never);
      expect(Number(p.heightMm)).toBe(2000);
      expect(levels.restore).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });
  });
});

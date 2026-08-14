import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BackupsService } from './backups.service';

/**
 * Bakım ekranındaki "eski yedekleri sil": en yeni `keep` dosya korunur,
 * keep=0 klasörü tamamen boşaltır. Veritabanına dokunmaz.
 */
describe('BackupsService — yedek dosyası temizliği', () => {
  let dir: string;
  let service: BackupsService;

  /** Dosya adları zaman damgalı → alfabetik sıra kronolojik sıradır. */
  const NAMES = [
    'yedek-2026-08-01.sql',
    'yedek-2026-08-02.sql',
    'yedek-2026-08-03.sql',
    'yedek-2026-08-04.sql',
  ];

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'backups-'));
    for (const name of NAMES) {
      await fs.writeFile(path.join(dir, name), 'SELECT 1;'.repeat(10));
    }
    // İlgisiz dosya: silinmemeli.
    await fs.writeFile(path.join(dir, 'okuma.txt'), 'x');

    const config = {
      get: jest.fn((key: string) =>
        key === 'backup' ? { dir, keep: 14 } : { host: 'h' },
      ),
    };
    service = new BackupsService(config as never);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const remaining = async () => (await fs.readdir(dir)).sort();

  it('en yeni `keep` dosyayı korur, eskileri siler', async () => {
    const result = await service.cleanup(2);

    expect(result.deleted).toBe(2);
    expect(result.freedBytes).toBeGreaterThan(0);
    expect(await remaining()).toEqual([
      'okuma.txt',
      'yedek-2026-08-03.sql',
      'yedek-2026-08-04.sql',
    ]);
  });

  it('keep=0 ile tüm yedekleri siler', async () => {
    const result = await service.cleanup(0);

    expect(result.deleted).toBe(4);
    // .sql olmayan dosyaya dokunmaz.
    expect(await remaining()).toEqual(['okuma.txt']);
  });

  it('korunacak sayı dosya sayısından fazlaysa hiçbir şey silmez', async () => {
    const result = await service.cleanup(10);

    expect(result.deleted).toBe(0);
    expect(await remaining()).toHaveLength(5);
  });

  it('disk kullanımını raporlar', async () => {
    const usage = await service.usage();

    expect(usage.files).toBe(4);
    expect(usage.totalBytes).toBeGreaterThan(0);
  });
});

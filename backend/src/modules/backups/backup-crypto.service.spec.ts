import * as crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BackupCryptoService } from './backup-crypto.service';

/**
 * Şifreli (.enc) yedeğin arayüzden geri yüklenebilmesi: sunucunun kendi
 * anahtarıyla çözülür; yedek başka/eski bir anahtarla şifrelendiyse çözüm
 * anlaşılır bir hatayla reddedilir (arayüz o zaman anahtarı kullanıcıdan ister).
 */
describe('BackupCryptoService — şifreli yedeği çözme', () => {
  let dir: string;
  let service: BackupCryptoService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-crypto-'));
    const config = {
      get: jest.fn(() => ({
        publicKeyFile: path.join(dir, 'key.pub.pem'),
        privateKeyFile: path.join(dir, 'key.priv.pem'),
      })),
    };
    service = new BackupCryptoService(config as never);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function encryptSample(sql: string): Promise<Buffer> {
    const file = path.join(dir, 'dump.sql');
    await fs.writeFile(file, sql, 'utf8');
    return service.encryptFile(file);
  }

  it('kendi anahtarıyla şifrelenen yedeği geri çözer', async () => {
    const sql = '-- yedek\nCREATE TABLE t (id int);\n';
    const envelope = await encryptSample(sql);

    // Zarf, şifreli olduğu anlaşılabilen bir JSON olmalı.
    expect(service.isEnvelope(envelope)).toBe(true);
    await expect(
      service.decryptEnvelope(envelope).then((b) => b.toString('utf8')),
    ).resolves.toBe(sql);
  });

  it('düz .sql dosyasını şifreli zarf sanmaz', () => {
    expect(service.isEnvelope(Buffer.from('CREATE TABLE t (id int);'))).toBe(
      false,
    );
  });

  it('başka bir anahtarla çözülmeye çalışılırsa anlaşılır hata verir', async () => {
    const envelope = await encryptSample('SELECT 1;');
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    await expect(service.decryptEnvelope(envelope, privateKey)).rejects.toThrow(
      /başka bir anahtarla şifrelenmiş/,
    );
  });

  it('anahtar yerine rastgele metin verilirse uyarır', async () => {
    const envelope = await encryptSample('SELECT 1;');

    await expect(service.decryptEnvelope(envelope, 'parolam123')).rejects.toThrow(
      /BEGIN PRIVATE KEY/,
    );
  });

  it('bozuk zarfı reddeder', async () => {
    await expect(
      service.decryptEnvelope(Buffer.from('{"v":1,"alg":"x"}')),
    ).rejects.toThrow(/eksik alanlar/);
  });

  it('kullanıcı anahtarı verilirse onunla çözer', async () => {
    const envelope = await encryptSample('SELECT 42;');
    const ownKey = await service.getPrivateKeyPem();

    await expect(
      service.decryptEnvelope(envelope, ownKey).then((b) => b.toString('utf8')),
    ).resolves.toBe('SELECT 42;');
  });
});

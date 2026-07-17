import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BackupConfig } from '../../config/configuration';

/**
 * Yedek şifreleme servisi (asimetrik zarf/hybrid şifreleme).
 *
 * Model (kullanıcı isteği): ŞİFRELEME anahtarı (public key) API'da bir dosyada
 * tutulur; ŞİFRE ÇÖZME anahtarı (private key) web arayüzünde gösterilir.
 *
 * Her yedek şu şekilde şifrelenir:
 *  1) rastgele 256-bit AES anahtarı üretilir, dosya AES-256-GCM ile şifrelenir,
 *  2) AES anahtarı RSA-OAEP(SHA-256) ile public key kullanılarak sarmalanır,
 *  3) sonuç, kendini tanımlayan bir JSON zarfı olarak (.enc) yazılır.
 *
 * Çözme yalnızca private key ile mümkündür (arayüzdeki "şifre çözme anahtarı").
 * Depodaki scripts/decrypt-backup.mjs bu zarfı çözer.
 */
@Injectable()
export class BackupCryptoService {
  private readonly logger = new Logger(BackupCryptoService.name);
  private readonly cfg: BackupConfig;
  private keysReady?: Promise<{ publicKeyPem: string; privateKeyPem: string }>;

  constructor(configService: ConfigService) {
    this.cfg = configService.get<BackupConfig>('backup')!;
  }

  private abs(p: string): string {
    return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  }

  /**
   * Anahtar çiftini hazırlar: dosyalar varsa okur, yoksa RSA-2048 üretip yazar.
   * public → publicKeyFile, private → privateKeyFile (0600). Bir kez çalışır.
   */
  private ensureKeys(): Promise<{ publicKeyPem: string; privateKeyPem: string }> {
    if (!this.keysReady) {
      this.keysReady = this.loadOrCreateKeys().catch((err) => {
        // Başarısızlıkta bir sonraki denemede tekrar üretmeyi mümkün kıl.
        this.keysReady = undefined;
        throw err;
      });
    }
    return this.keysReady;
  }

  private async loadOrCreateKeys(): Promise<{
    publicKeyPem: string;
    privateKeyPem: string;
  }> {
    const pubPath = this.abs(this.cfg.publicKeyFile);
    const privPath = this.abs(this.cfg.privateKeyFile);

    try {
      const [publicKeyPem, privateKeyPem] = await Promise.all([
        fs.readFile(pubPath, 'utf8'),
        fs.readFile(privPath, 'utf8'),
      ]);
      if (publicKeyPem.includes('PUBLIC KEY') && privateKeyPem.includes('PRIVATE KEY')) {
        return { publicKeyPem, privateKeyPem };
      }
    } catch {
      // Dosyalar yok/eksik → üret.
    }

    this.logger.log('Yedek anahtar çifti bulunamadı, yeni RSA-2048 çifti üretiliyor…');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    await fs.mkdir(path.dirname(pubPath), { recursive: true });
    await fs.mkdir(path.dirname(privPath), { recursive: true });
    await fs.writeFile(pubPath, publicKey, { mode: 0o600 });
    await fs.writeFile(privPath, privateKey, { mode: 0o600 });
    this.logger.log(
      `Yedek anahtarları yazıldı: public=${pubPath}, private=${privPath}`,
    );
    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  }

  /**
   * Bir dosyayı hibrit (RSA-OAEP + AES-256-GCM) şifreler; .enc zarf içeriğini
   * (Buffer) döner. Zarf JSON: { v, alg, key, iv, tag, data } (hepsi base64).
   */
  async encryptFile(inputPath: string): Promise<Buffer> {
    const { publicKeyPem } = await this.ensureKeys();
    const plaintext = await fs.readFile(inputPath);

    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const wrappedKey = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKey,
    );

    const envelope = {
      v: 1,
      alg: 'RSA-OAEP-256+AES-256-GCM',
      key: wrappedKey.toString('base64'),
      iv: iv.toString('base64'),
      tag: authTag.toString('base64'),
      data: ciphertext.toString('base64'),
    };
    return Buffer.from(JSON.stringify(envelope), 'utf8');
  }

  /** Web arayüzünde gösterilecek şifre çözme (private) anahtarı — PEM. */
  async getPrivateKeyPem(): Promise<string> {
    const { privateKeyPem } = await this.ensureKeys();
    return privateKeyPem;
  }

  /** Public (şifreleme) anahtarının parmak izi — arayüzde doğrulama için. */
  async getPublicKeyFingerprint(): Promise<string> {
    const { publicKeyPem } = await this.ensureKeys();
    const der = crypto.createPublicKey(publicKeyPem).export({
      type: 'spki',
      format: 'der',
    });
    const hash = crypto.createHash('sha256').update(der).digest('hex');
    // xx:xx:… biçiminde okunur parmak izi.
    return hash.match(/.{2}/g)!.join(':');
  }
}

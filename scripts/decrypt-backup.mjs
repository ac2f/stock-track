#!/usr/bin/env node
/**
 * Şifreli veritabanı yedeğini (.enc) çözer.
 *
 * Kullanım:
 *   node scripts/decrypt-backup.mjs <yedek.sql.enc> <ozel-anahtar.pem> [cikti.sql]
 *
 * <ozel-anahtar.pem> = web arayüzünde (Ayarlar › Yedekleme › Şifre çözme anahtarı)
 * gösterilen PRIVATE KEY. Onu bir dosyaya kaydedip buraya verin.
 * Çıktı verilmezse çözülen içerik stdout'a yazılır.
 *
 * Zarf biçimi: { v, alg:"RSA-OAEP-256+AES-256-GCM", key, iv, tag, data } (base64).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  constants,
  createDecipheriv,
  privateDecrypt,
} from 'node:crypto';

const [, , encPath, keyPath, outPath] = process.argv;
if (!encPath || !keyPath) {
  console.error(
    'Kullanım: node scripts/decrypt-backup.mjs <yedek.sql.enc> <ozel-anahtar.pem> [cikti.sql]',
  );
  process.exit(1);
}

const envelope = JSON.parse(readFileSync(encPath, 'utf8'));
if (envelope.alg !== 'RSA-OAEP-256+AES-256-GCM') {
  console.error(`Desteklenmeyen algoritma: ${envelope.alg}`);
  process.exit(1);
}

const privateKeyPem = readFileSync(keyPath, 'utf8');
const aesKey = privateDecrypt(
  {
    key: privateKeyPem,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  },
  Buffer.from(envelope.key, 'base64'),
);

const decipher = createDecipheriv(
  'aes-256-gcm',
  aesKey,
  Buffer.from(envelope.iv, 'base64'),
);
decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
const plaintext = Buffer.concat([
  decipher.update(Buffer.from(envelope.data, 'base64')),
  decipher.final(),
]);

if (outPath) {
  writeFileSync(outPath, plaintext);
  console.error(`Çözüldü → ${outPath} (${plaintext.length} bayt)`);
} else {
  process.stdout.write(plaintext);
}

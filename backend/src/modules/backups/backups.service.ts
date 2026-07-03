import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BackupConfig, DatabaseConfig } from '../../config/configuration';

export interface BackupFileInfo {
  name: string;
  size: number;
  createdAt: string;
}

export interface CreatedBackup {
  filePath: string;
  fileName: string;
  size: number;
}

/**
 * Veritabanı yedekleme/geri yükleme. `pg_dump` ile anlık .sql üretir, `psql` ile
 * geri yükler. Kimlik bilgileri ConfigService.database'den alınır (process.env'e
 * doğrudan erişilmez); parola PGPASSWORD ortam değişkeniyle alt sürece geçirilir.
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly db: DatabaseConfig;
  private readonly cfg: BackupConfig;

  constructor(configService: ConfigService) {
    this.db = configService.get<DatabaseConfig>('database')!;
    this.cfg = configService.get<BackupConfig>('backup')!;
  }

  /** Yedek dizininin mutlak yolu (gerekirse oluşturur). */
  private async ensureDir(): Promise<string> {
    const dir = path.isAbsolute(this.cfg.dir)
      ? this.cfg.dir
      : path.join(process.cwd(), this.cfg.dir);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  private bin(name: 'pg_dump' | 'psql'): string {
    return this.cfg.binDir ? path.join(this.cfg.binDir, name) : name;
  }

  /** Zaman damgalı yedek dosya adı: stocktrack-YYYYMMDD-HHmmss.sql */
  private stampedName(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp =
      `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
      `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return `${this.db.database}-${stamp}.sql`;
  }

  /**
   * pg_dump ile anlık plain-SQL yedek üretir; dosya yolunu döner.
   * @param toDir true → yapılandırılan yedek dizinine (kalıcı), false → geçici dizine.
   */
  async createBackup(toDir = true): Promise<CreatedBackup> {
    const dir = toDir ? await this.ensureDir() : os.tmpdir();
    const fileName = this.stampedName();
    const filePath = path.join(dir, fileName);

    await this.run(this.bin('pg_dump'), [
      '-h',
      this.db.host,
      '-p',
      String(this.db.port),
      '-U',
      this.db.username,
      '-d',
      this.db.database,
      '--no-owner',
      '--no-privileges',
      // --clean/--if-exists → yedek, geri yüklenirken mevcut nesneleri önce
      // güvenle DROP eder; böylece dolu bir veritabanına da geri yüklenebilir
      // ("relation already exists" hatası olmadan).
      '--clean',
      '--if-exists',
      '-f',
      filePath,
    ]);

    const stat = await fs.stat(filePath);
    if (toDir && this.cfg.keep > 0) {
      await this.pruneOld(dir);
    }
    return { filePath, fileName, size: stat.size };
  }

  /** İndirilebilir yedek: geçici dosya üretir, akış + temizlik için yol döner. */
  async createDownloadable(): Promise<{
    stream: ReturnType<typeof createReadStream>;
    fileName: string;
    size: number;
    cleanup: () => void;
  }> {
    const created = await this.createBackup(false);
    const stream = createReadStream(created.filePath);
    // Akış bittiğinde geçici dosyayı sil (best-effort).
    const cleanup = () => {
      fs.unlink(created.filePath).catch(() => undefined);
    };
    stream.once('close', cleanup);
    stream.once('error', cleanup);
    return {
      stream,
      fileName: created.fileName,
      size: created.size,
      cleanup,
    };
  }

  /**
   * Yüklenen .sql yedeğini psql ile UYGULAR (mevcut veriyi ÜZERİNE yazabilir).
   * ON_ERROR_STOP=1 → ilk hatada durur; hata olursa exception fırlatır.
   */
  async restore(buffer: Buffer): Promise<void> {
    if (!buffer?.length) {
      throw new BadRequestException('Boş yedek dosyası.');
    }
    // Basit içerik doğrulaması — düz metin SQL beklenir.
    const head = buffer.subarray(0, 4096).toString('utf8');
    if (!/(CREATE|INSERT|COPY|SET|--|ALTER|DROP)/i.test(head)) {
      throw new BadRequestException(
        'Geçersiz yedek dosyası (SQL içeriği bulunamadı).',
      );
    }
    const tmp = path.join(os.tmpdir(), `restore-${Date.now()}.sql`);
    await fs.writeFile(tmp, buffer);
    try {
      await this.run(this.bin('psql'), [
        '-h',
        this.db.host,
        '-p',
        String(this.db.port),
        '-U',
        this.db.username,
        '-d',
        this.db.database,
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        tmp,
      ]);
    } finally {
      await fs.unlink(tmp).catch(() => undefined);
    }
  }

  /** Diskteki kalıcı yedekleri (yeni→eski) listeler. */
  async list(): Promise<BackupFileInfo[]> {
    const dir = await this.ensureDir();
    const names = await fs.readdir(dir);
    const files: BackupFileInfo[] = [];
    for (const name of names) {
      if (!name.endsWith('.sql')) continue;
      const stat = await fs.stat(path.join(dir, name));
      files.push({
        name,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      });
    }
    files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return files;
  }

  /** `keep` sayısını aşan en eski yedekleri siler. */
  private async pruneOld(dir: string): Promise<void> {
    const names = (await fs.readdir(dir))
      .filter((n) => n.endsWith('.sql'))
      .sort();
    const excess = names.length - this.cfg.keep;
    for (let i = 0; i < excess; i++) {
      await fs.unlink(path.join(dir, names[i])).catch(() => undefined);
    }
  }

  /** Alt süreci PGPASSWORD ile çalıştırır; çıkış kodu 0 değilse hata fırlatır. */
  private run(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: { ...process.env, PGPASSWORD: this.db.password },
      });
      let stderr = '';
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', (err) => {
        this.logger.error(`${command} başlatılamadı: ${err.message}`);
        reject(
          new InternalServerErrorException(
            `Yedekleme aracı çalıştırılamadı (${command}). ` +
              'PostgreSQL istemci araçları (pg_dump/psql) kurulu mu?',
          ),
        );
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          this.logger.error(`${command} kodu ${code}: ${stderr.trim()}`);
          reject(
            new InternalServerErrorException(
              `Yedekleme işlemi başarısız (kod ${code}): ${stderr.trim().slice(0, 500)}`,
            ),
          );
        }
      });
    });
  }
}

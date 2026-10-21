import { SetMetadata } from '@nestjs/common';

export const SYNC_SKIP_KEY = 'sync:skip';
export const SYNC_JOURNAL_KEY = 'sync:journal';
export const PRIMARY_ONLY_KEY = 'sync:primaryOnly';

/**
 * Yerel sunucuda (replika) giden kutusuna YAZILMAYAN yazma ucu: oturum açma,
 * runner nabzı, eşitleme ekranının kendi işlemleri. Yerelde çalışır, merkeze
 * gönderilmez.
 */
export const SyncSkip = () => SetMetadata(SYNC_SKIP_KEY, true);

/**
 * Dükkân izni tanımı olmayan (ör. Corel anahtarıyla gelen) ama merkeze
 * gönderilmesi gereken yazma ucu. Runner'ın klasör bildirimi gibi.
 */
export const SyncJournal = () => SetMetadata(SYNC_JOURNAL_KEY, true);

/**
 * Yalnız merkezde yapılabilen işlem: yerel sunucuda 409 döner. Anahtar
 * üretimi (yerelde üretilen anahtar merkezde farklı olurdu), sistem ayarları,
 * dosya yükleyen uçlar ...
 */
export const PrimaryOnly = () => SetMetadata(PRIMARY_ONLY_KEY, true);

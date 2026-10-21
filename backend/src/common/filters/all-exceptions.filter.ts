import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Veritabanı kısıt ihlalleri istemcinin düzeltebileceği hatalardır (ör. aynı
 * kodla ikinci depo); 500 değil 409 döner. Çevrimdışı kuyruk 5xx'i "sunucu
 * sorunu, sonra yeniden dene" sayar — kısıt ihlali sonsuza dek denenmesin.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  '23505': 'Bu kayıt zaten var (aynı ad/kod kullanılıyor).',
  '23503': 'Kayıt, bağlı olduğu ya da ona bağlı başka bir kayıt yüzünden işlenemedi.',
};

/**
 * Veritabanına ulaşılamıyor (kapalı, yeniden başlıyor, bağlantı koptu). 503
 * döner: arayüz bunu "sunucu geçici olarak yok" sayar ve işlemleri cihazda
 * biriktirir; sağlık ucu tekrar 200 olunca eşzamanlar.
 */
const DB_DOWN_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENOTFOUND',
  '57P01',
  '57P02',
  '57P03',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
]);

function isDatabaseDown(exception: unknown): boolean {
  const err = exception as { code?: string; driverError?: { code?: string }; message?: string };
  const code = err?.driverError?.code ?? err?.code;
  if (code && DB_DOWN_CODES.has(code)) return true;
  return /Connection terminated|connection timeout|Client has encountered a connection error/i.test(
    err?.message ?? '',
  );
}

function constraintMessage(exception: unknown): string | null {
  if (!(exception instanceof QueryFailedError)) return null;
  const code = (exception as QueryFailedError & { driverError?: { code?: string } }).driverError?.code;
  return code ? CONSTRAINT_MESSAGES[code] ?? null : null;
}

/**
 * Tüm hataları tek ve tutarlı bir gövdeye dönüştüren global filtre.
 * İstemci her zaman aynı yapıyı alır; iç ayrıntılar sızdırılmaz.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const constraint = constraintMessage(exception);
    const dbDown = !(exception instanceof HttpException) && isDatabaseDown(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : constraint
          ? HttpStatus.CONFLICT
          : dbDown
            ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] =
      constraint ?? (dbDown ? 'Veritabanına şu an ulaşılamıyor.' : 'Beklenmeyen bir hata oluştu.');
    // Makinelerin okuduğu kısa hata kodu (ör. eşitlemede RESNAPSHOT).
    let code: string | undefined;
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : ((res as Record<string, unknown>).message as string) ??
            exception.message;
      const c = typeof res === 'object' ? (res as Record<string, unknown>).code : undefined;
      if (typeof c === 'string' && /^[A-Z_]{2,40}$/.test(c)) code = c;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR && !dbDown) {
      this.logger.error(
        `${request.method} ${request.url}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      ...(code ? { code } : {}),
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Başarılı yanıtları standart bir zarfa sarar:
 *   { success, data, timestamp }
 * Böylece frontend tüm uçlarda aynı şekli tüketir.
 *
 * İSTİSNALAR (olduğu gibi, sarmalanmadan geçirilir; aksi halde içerik bozulur):
 *  - İkili (binary) yanıtlar — PDF/Excel gibi StreamableFile.
 *  - Controller'ın Content-Type'ı JSON dışı (örn. text/html, text/csv) olarak
 *    elle ayarladığı ham yanıtlar — örn. yazdırılabilir teklif HTML'i. Aksi
 *    halde HTML, JSON zarfına gömülür ve tarayıcıda ham metin olarak görünür.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | StreamableFile>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | StreamableFile> {
    const res = context.switchToHttp().getResponse<{
      getHeader(name: string): unknown;
    }>();
    return next.handle().pipe(
      map((data) => {
        const contentType = String(res.getHeader('Content-Type') ?? '');
        const isRaw =
          contentType !== '' && !contentType.includes('application/json');
        if (data instanceof StreamableFile || isRaw) {
          return data;
        }
        return {
          success: true as const,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}

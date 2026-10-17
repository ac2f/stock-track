import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SettingsService } from '../settings/settings.service';

/**
 * Corel uçları JWT yerine sabit bir anahtarla korunur: eklenti bir VBA
 * makrosudur, oturum açıp token yenileyemez. Anahtar Ayarlar'dan üretilir
 * ve `X-Api-Key` başlığında gelir. Boşken entegrasyon kapalıdır.
 */
@Injectable()
export class CorelKeyGuard implements CanActivate {
  constructor(private readonly settings: SettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-api-key'];
    const key = (Array.isArray(header) ? header[0] : header) ?? '';

    const check = await this.settings.checkCorelKey(key);
    if (check === 'disabled') {
      throw new UnauthorizedException(
        'Corel entegrasyonu kapalı. Ayarlar › Corel entegrasyonu bölümünden anahtar oluşturun.',
      );
    }
    if (check !== 'ok') {
      throw new UnauthorizedException(
        'Corel anahtarı geçersiz. Ayarlar › Corel entegrasyonu bölümündeki anahtarı eklentiye yapıştırın.',
      );
    }
    return true;
  }
}

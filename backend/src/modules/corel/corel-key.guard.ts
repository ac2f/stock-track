import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ShopContext } from '../../common/shop/shop-context';
import { SettingsService } from '../settings/settings.service';

/**
 * Corel uçları JWT yerine sabit bir anahtarla korunur: eklenti bir VBA
 * makrosudur, oturum açıp token yenileyemez. Anahtar Ayarlar'dan üretilir
 * ve `X-Api-Key` başlığında gelir. Her dükkânın kendi anahtarı vardır;
 * eklenti hangi anahtarı taşıyorsa o dükkânın verisini görür.
 */
@Injectable()
export class CorelKeyGuard implements CanActivate {
  constructor(private readonly settings: SettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-api-key'];
    const key = (Array.isArray(header) ? header[0] : header) ?? '';

    const { check, shopId } = await this.settings.resolveCorelKey(key);
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
    // Anahtar dükkânı da belirler: uçlar o dükkânın müşteri/stok listesini görür.
    ShopContext.enter(shopId!);
    return true;
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtConfig } from '../../../config/configuration';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  fullName: string;
}

/**
 * Access token doğrulama stratejisi. Token geçerliyse kullanıcının hâlâ var ve
 * aktif olduğu doğrulanır; kimlik (rol/ad) güncel haliyle DB'den alınır.
 *
 * NOT: Eskiden token tümüyle "stateless" kabul ediliyordu (DB'ye bakılmazdı).
 * Ancak DB yeniden seed'lenip kullanıcı UUID'leri değişince, tarayıcıda kalan
 * eski token imza/süre olarak geçerli görünüp `sub` artık olmayan bir kullanıcıyı
 * işaret edebiliyordu. Bu, satış gibi `sold_by_id` FK'sine yazan akışlarda
 * kafa karıştırıcı 500 (foreign key) hatasına yol açıyordu. Artık token sahibi
 * DB'de doğrulanır; bulunamaz/pasifse 401 döner ve istemci yeniden giriş yapar.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const jwt = configService.get<JwtConfig>('jwt')!;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwt.accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Geçersiz token.');
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Oturum geçersiz. Lütfen yeniden giriş yapın.',
      );
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
  }
}

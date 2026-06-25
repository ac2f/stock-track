import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtConfig } from '../../config/configuration';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { JwtPayload } from './strategies/jwt.strategy';
import { LoginDto } from './dto/login.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
}

@Injectable()
export class AuthService {
  private readonly jwtConfig: JwtConfig;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtConfig = configService.get<JwtConfig>('jwt')!;
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('E-posta veya parola hatalı.');
    }
    const valid = await UsersService.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!valid) {
      throw new UnauthorizedException('E-posta veya parola hatalı.');
    }
    return this.buildAuthResult(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        { secret: this.jwtConfig.refreshSecret },
      );
      const user = await this.usersService.findOne(payload.sub);
      if (!user.isActive) {
        throw new UnauthorizedException();
      }
      return this.signTokens(user);
    } catch {
      throw new UnauthorizedException('Yenileme token geçersiz veya süresi dolmuş.');
    }
  }

  private async buildAuthResult(user: User): Promise<AuthResult> {
    const tokens = await this.signTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  private async signTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtConfig.accessSecret,
        expiresIn: this.jwtConfig.accessExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.jwtConfig.refreshSecret,
        expiresIn: this.jwtConfig.refreshExpiresIn,
      }),
    ]);
    return { accessToken, refreshToken };
  }
}

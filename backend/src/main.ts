import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>('app')!;

  // Güvenlik & CORS (mobil + masaüstü istemciler için açık)
  app.use(helmet());
  app.enableCors({ origin: appConfig.corsOrigin, credentials: true });

  app.setGlobalPrefix(appConfig.globalPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Gelen tüm payload'ları DTO'lara göre doğrula & dönüştür.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Çapraz kesen davranışlar tek yerden.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Global koruma: önce kimlik (JWT), sonra rol (RBAC).
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));

  // API dokümantasyonu (Swagger)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('StockTrack ERP API')
    .setDescription('Stok, Tedarik ve Müşteri Cari Takip Sistemi')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${appConfig.globalPrefix}/docs`, app, document);

  // Tüm ağ arayüzlerinden (0.0.0.0) dinle → yerel ağdaki diğer cihazlar
  // (telefon/tablet/başka bilgisayar) http://<sunucu-ip>:<port> ile bağlanabilir.
  await app.listen(appConfig.port, '0.0.0.0');
}

void bootstrap();

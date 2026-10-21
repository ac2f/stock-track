import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { runSeed } from './database/seed';
import { AppConfig, JwtConfig, SyncConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { shopContextMiddleware } from './common/shop/shop-context.middleware';
import { installShopScope } from './common/shop/shop-scope.typeorm';
import { ShopAccessGuard } from './modules/shops/shop-access.guard';
import { ShopAccessService } from './modules/shops/shop-access.service';
import { migrateToShops } from './modules/shops/shop-migration';
import { installSyncCapture } from './modules/sync/sync-capture';
import { SyncCaptureSubscriber } from './modules/sync/sync-capture.subscriber';
import { SyncInterceptor } from './modules/sync/sync.interceptor';
import { syncReplayMiddleware } from './modules/sync/sync-request';
import { replaySecret } from './modules/sync/sync-replay.secret';
import { PrimaryOnlyGuard } from './modules/sync/primary-only.guard';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>('app')!;

  // Dükkân ayrımı: her sorgu o anki dükkâna süzülür. Şema hazırdır; eski
  // (dükkânsız) kayıtlar herhangi bir istekten önce ilk dükkâna atanır.
  // Başarısız olursa uygulama BAŞLAMAZ — yarım geçişle çalışmaktansa.
  const dataSource = app.get(DataSource);
  installShopScope(dataSource);
  dataSource.subscribers.push(new SyncCaptureSubscriber());

  // Merkez/yerel sunucu (docs/SYNC.md). Yerel sunucu (replika) verisini
  // merkezden alır: dükkân göçü ve tohumlama ÇALIŞMAZ (merkezdekiyle çakışan
  // kayıtlar açılırdı); veritabanı ilk yüklemeye kadar boş kalır.
  const sync = configService.get<SyncConfig>('sync')!;
  if (sync.role !== 'replica') await migrateToShops(dataSource);
  // Değişiklik günlüğü tetikleyicileri (her iki rolde).
  await installSyncCapture(dataSource, (m) => console.log(m));
  if (sync.role === 'replica') {
    // Önceki çalışmada yarıda kalan yerel işlem: tamamlanıp tamamlanmadığı
    // bilinmiyor → kişi karar verir (merkeze kendiliğinden gönderilmez).
    await dataSource.query(
      `UPDATE replica_outbox SET state = 'uncertain', updated_at = now(),
              error = 'Yerel sunucu işlem sırasında kapandı; işlemin yapılıp yapılmadığını kontrol edin.'
        WHERE state = 'executing'`,
    );
    console.log('Yerel sunucu (replika) kipi: yazma işlemleri giden kutusuna yazılır.');
  }

  // Her istek kendi dükkân bağlamında çalışır (guard dükkânı yazar).
  app.use(shopContextMiddleware);
  // Merkezde, replikadan gelen işlemin iç yeniden oynatması (gizli başlıkla).
  app.use(syncReplayMiddleware(replaySecret(configService.get<JwtConfig>('jwt')!.accessSecret)));

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
  // Tekrar koruması en dışta: saklanan yanıt zarflı gövdenin kendisidir.
  // Eşitleme (giden kutusu / yeniden oynatma yanıtı) tekrar korumasının içinde.
  app.useGlobalInterceptors(
    app.get(IdempotencyInterceptor),
    app.get(SyncInterceptor),
    new TransformInterceptor(),
  );

  // Global koruma: önce kimlik (JWT), sonra rol (RBAC), sonra dükkân ve
  // alan izni (okuma/yazma).
  const reflector = app.get(Reflector);
  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    new RolesGuard(reflector),
    new ShopAccessGuard(reflector, app.get(ShopAccessService)),
    // Yerel sunucuda yalnız merkezde yapılabilen işlemler 409 döner.
    new PrimaryOnlyGuard(reflector, sync.role),
  );

  // API dokümantasyonu (Swagger)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('StockTrack ERP API')
    .setDescription('Stok, Tedarik ve Müşteri Cari Takip Sistemi')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${appConfig.globalPrefix}/docs`, app, document);

  // Açılışta otomatik (idempotent) tohumlama: OWNER + varsayılanlar. Şema bu
  // noktada (TypeORM synchronize) hazırdır. Böylece üretimde ayrı bir seed
  // komutu çalıştırmaya gerek kalmadan ilk girişin yapılabileceği hesap oluşur.
  // SEED_ON_BOOT=false ile kapatılabilir.
  if (process.env.SEED_ON_BOOT !== 'false' && sync.role !== 'replica') {
    try {
      await runSeed(dataSource);
    } catch (err) {
      console.error('Açılış tohumlaması başarısız (uygulama yine de başlıyor):', err);
    }
  }

  // Tüm ağ arayüzlerinden (0.0.0.0) dinle → yerel ağdaki diğer cihazlar
  // (telefon/tablet/başka bilgisayar) http://<sunucu-ip>:<port> ile bağlanabilir.
  await app.listen(appConfig.port, '0.0.0.0');
}

void bootstrap();

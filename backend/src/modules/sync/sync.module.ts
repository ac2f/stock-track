import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from '../shops/entities/shop.entity';
import { ReplicaOutbox } from './entities/replica-outbox.entity';
import { ReplicaState } from './entities/replica-state.entity';
import { SyncChange } from './entities/sync-change.entity';
import { SyncReplica } from './entities/sync-replica.entity';
import { ReplicaGuard } from './replica.guard';
import { SyncController, SyncReplicasController } from './sync.controller';
import { SyncInterceptor } from './sync.interceptor';
import { SyncFeedService } from './sync-feed.service';
import { SyncPruneScheduler } from './sync-prune.scheduler';
import { SyncPushService } from './sync-push.service';
import { SyncReplicasService } from './sync-replicas.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

/**
 * Merkez ↔ yerel sunucu eşitlemesi (docs/SYNC.md). Global: interceptor
 * main.ts'te uygulamaya takılır.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SyncChange, SyncReplica, ReplicaOutbox, ReplicaState, Shop]),
    JwtModule.register({}),
  ],
  controllers: [SyncController, SyncReplicasController, SystemController],
  providers: [
    SyncFeedService,
    SyncPushService,
    SyncReplicasService,
    SystemService,
    ReplicaGuard,
    SyncInterceptor,
    SyncPruneScheduler,
  ],
  exports: [SyncInterceptor, SyncFeedService],
})
export class SyncModule {}

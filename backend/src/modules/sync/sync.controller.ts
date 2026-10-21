import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { NoShop } from '../../common/shop/shop-access.decorator';
import {
  ChangesQueryDto,
  CreateReplicaDto,
  PushDto,
  RowsDto,
  SnapshotQueryDto,
  UpdateReplicaDto,
} from './dto/sync.dto';
import { ReplicaGuard, ReplicaRequest } from './replica.guard';
import { SyncSkip } from './sync.decorators';
import { SyncFeedService } from './sync-feed.service';
import { PushOp, SyncPushService } from './sync-push.service';
import { SyncReplicasService } from './sync-replicas.service';

/**
 * Merkezin yerel sunuculara (replika) açtığı eşitleme uçları — oturum yerine
 * `X-Replica-Token`. Ayrıntı: docs/SYNC.md.
 */
@ApiTags('sync')
@Public()
@NoShop()
@SyncSkip()
@UseGuards(ReplicaGuard)
@Controller({ path: 'sync', version: '1' })
export class SyncController {
  constructor(
    private readonly feed: SyncFeedService,
    private readonly pushes: SyncPushService,
    private readonly replicas: SyncReplicasService,
  ) {}

  /** Bağlantı denemesi: merkez kimliği, protokol, şema özeti, güncel imleç. */
  @Get('hello')
  async hello(@Req() req: ReplicaRequest) {
    await this.replicas.touch(req.replica!.id);
    return this.feed.hello(req.replica!);
  }

  /** Eşitlenen tablolar (bağımlılık sırasıyla), sütunları ve kapsamları. */
  @Get('schema')
  schema() {
    const { tables, hash } = this.feed.schema();
    return { schemaHash: hash, tables };
  }

  /** İlk yükleme: bir tablonun satırları, sayfa sayfa (`afterId` imleci). */
  @Get('snapshot')
  snapshot(@Req() req: ReplicaRequest, @Query() q: SnapshotQueryDto) {
    return this.feed.snapshot(req.replica!, q.table, q.afterId, q.limit);
  }

  /** Değişiklik akışı (`since` imleci). 410 RESNAPSHOT → baştan yükle. */
  @Get('changes')
  async changes(@Req() req: ReplicaRequest, @Query() q: ChangesQueryDto) {
    const page = await this.feed.changes(req.replica!, q.since, q.limit);
    await this.replicas.touch(req.replica!.id, { lastSeq: q.since });
    return page;
  }

  /** Kimlikle satırlar (yerel değişikliği merkezdeki hale döndürmek için). */
  @Post('rows')
  @HttpCode(200)
  rows(@Req() req: ReplicaRequest, @Body() dto: RowsDto) {
    return this.feed.rows(req.replica!, dto.table, dto.ids);
  }

  /** Giden kutusundaki işlemleri sırayla uygular; işlem başına sonuç döner. */
  @Post('push')
  @HttpCode(200)
  async push(@Req() req: ReplicaRequest, @Body() dto: PushDto) {
    return { results: await this.pushes.push(req.replica!, dto.ops as PushOp[]) };
  }
}

/** Yerel sunucu anahtarlarının yönetimi — yalnız sistem sahibi, merkezde. */
@ApiTags('sync')
@Roles(UserRole.OWNER)
@NoShop()
@Controller({ path: 'sync/replicas', version: '1' })
export class SyncReplicasController {
  constructor(
    private readonly replicas: SyncReplicasService,
    private readonly feed: SyncFeedService,
  ) {}

  @Get()
  async list() {
    const [items, seq] = await Promise.all([this.replicas.list(), this.feed.currentSeq()]);
    return items.map((r) => ({
      ...r,
      // Merkezin günlüğünden kaç değişiklik geride (yaklaşık).
      lag: r.lastSeq != null ? Math.max(0, Number(seq) - Number(r.lastSeq)) : null,
    }));
  }

  /** Yeni yerel sunucu: anahtar yalnız bu yanıtta görünür. */
  @Post()
  create(@Body() dto: CreateReplicaDto, @CurrentUser('id') userId: string) {
    return this.replicas.create(dto, userId);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReplicaDto) {
    return this.replicas.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.replicas.remove(id);
    return { removed: true };
  }
}

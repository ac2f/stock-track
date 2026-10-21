import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { SyncReplica } from './entities/sync-replica.entity';
import { SyncReplicasService } from './sync-replicas.service';

export type ReplicaRequest = Request & { replica?: SyncReplica };

/**
 * /sync veri uçları: oturum yerine yerel sunucu anahtarı (`X-Replica-Token`).
 * Yalnız merkezde açıktır — yerel sunucudan yerel sunucuya eşitleme yoktur.
 */
@Injectable()
export class ReplicaGuard implements CanActivate {
  constructor(
    private readonly replicas: SyncReplicasService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get('sync.role') === 'replica') {
      throw new ForbiddenException('Bu sunucu yerel sunucu (replika); eşitleme merkez sunucuyla yapılır.');
    }
    const req = context.switchToHttp().getRequest<ReplicaRequest>();
    const header = req.headers['x-replica-token'];
    req.replica = await this.replicas.verify(Array.isArray(header) ? header[0] : header);
    return true;
  }
}

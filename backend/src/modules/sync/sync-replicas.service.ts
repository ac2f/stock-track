import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import { ShopContext } from '../../common/shop/shop-context';
import { Shop } from '../shops/entities/shop.entity';
import { SyncReplica } from './entities/sync-replica.entity';

export const REPLICA_TOKEN_PREFIX = 'str_';

export function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

/** Replika (yerel sunucu) anahtarları — yalnız sistem sahibi yönetir. */
@Injectable()
export class SyncReplicasService {
  constructor(
    @InjectRepository(SyncReplica) private readonly repo: Repository<SyncReplica>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
  ) {}

  list(): Promise<SyncReplica[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  /** Yeni replika: anahtar YALNIZ bu yanıtta görünür. */
  async create(
    input: { name: string; shopIds?: string[] },
    createdById: string,
  ): Promise<{ replica: SyncReplica; token: string }> {
    const shopIds = [...new Set(input.shopIds ?? [])];
    if (shopIds.length) {
      const found = await ShopContext.unscoped(() => this.shops.count({ where: { id: In(shopIds) } }));
      if (found !== shopIds.length) throw new NotFoundException('Seçilen dükkânlardan biri bulunamadı.');
    }
    const token = REPLICA_TOKEN_PREFIX + randomBytes(24).toString('base64url');
    const saved = await this.repo.save(
      this.repo.create({
        name: input.name.trim(),
        tokenHash: hashToken(token),
        tokenPrefix: token.slice(0, 10),
        shopIds,
        isActive: true,
        createdById,
      }),
    );
    return { replica: saved, token };
  }

  async update(id: string, input: { name?: string; isActive?: boolean }): Promise<SyncReplica> {
    const replica = await this.repo.findOne({ where: { id } });
    if (!replica) throw new NotFoundException('Yerel sunucu bulunamadı.');
    if (input.name !== undefined) replica.name = input.name.trim();
    if (input.isActive !== undefined) replica.isActive = input.isActive;
    return this.repo.save(replica);
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.softDelete({ id });
    if (!res.affected) throw new NotFoundException('Yerel sunucu bulunamadı.');
  }

  /** Anahtar → etkin replika (yoksa 401). */
  async verify(token: string | undefined): Promise<SyncReplica> {
    if (!token || !token.startsWith(REPLICA_TOKEN_PREFIX)) {
      throw new UnauthorizedException('Yerel sunucu anahtarı gerekli (X-Replica-Token).');
    }
    const replica = await this.repo.findOne({ where: { tokenHash: hashToken(token), isActive: true } });
    if (!replica) throw new UnauthorizedException('Yerel sunucu anahtarı geçersiz ya da kapatılmış.');
    return replica;
  }

  async touch(id: string, patch: Partial<Pick<SyncReplica, 'lastSeq' | 'lastPushAt'>> & { pushed?: number; rejected?: number } = {}): Promise<void> {
    const { pushed = 0, rejected = 0, ...rest } = patch;
    await this.repo
      .createQueryBuilder()
      .update(SyncReplica)
      .set({
        ...rest,
        lastSeenAt: () => 'now()',
        pushedOps: () => `pushed_ops + ${Math.max(0, Math.floor(pushed))}`,
        rejectedOps: () => `rejected_ops + ${Math.max(0, Math.floor(rejected))}`,
      })
      .where('id = :id', { id })
      .execute();
  }
}

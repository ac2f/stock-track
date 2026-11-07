import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GeoService } from '../geo/geo.service';
import { Shop, ShopStatus } from '../shops/entities/shop.entity';
import { UpdateBusinessProfileDto } from './dto/platform.dto';
import { ShopLabel } from './entities/shop-label.entity';
import { LabelsService } from './labels.service';

export interface BusinessProfileView {
  id: string;
  name: string;
  legalName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  province: string | null;
  district: string | null;
  addressLine: string | null;
  description: string | null;
  directoryVisible: boolean;
  shareDebtInfo: boolean;
  shareCustomerInfo: boolean;
  labelIds: string[];
  labels: { id: string; name: string }[];
  status: ShopStatus;
  plan: string;
  subscriptionUntil: string | null;
  /** Rehberde görünmek için eksik olanlar (boşsa profil yeterli). */
  missingForDirectory: string[];
}

/** İşletmenin kendi profili: iletişim, adres (il/ilçe), etiketler, rehber ve paylaşım tercihleri. */
@Injectable()
export class BusinessProfileService {
  constructor(
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly geo: GeoService,
    private readonly labels: LabelsService,
  ) {}

  async get(shopId: string): Promise<BusinessProfileView> {
    const shop = await this.shops.findOne({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('İşletme bulunamadı.');
    const rows: { id: string; name: string }[] = await this.dataSource.query(
      `SELECT bl.id, bl.name FROM shop_labels sl
         JOIN business_labels bl ON bl.id = sl.label_id AND bl.deleted_at IS NULL
        WHERE sl.shop_id = $1 ORDER BY bl.sort_order, bl.name`,
      [shopId],
    );
    return this.view(shop, rows);
  }

  async update(shopId: string, dto: UpdateBusinessProfileDto): Promise<BusinessProfileView> {
    const shop = await this.shops.findOne({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('İşletme bulunamadı.');

    // İl/ilçe: listedeki yazıma çözülür; ilçe o ile ait olmalı.
    let province = shop.province ?? null;
    let district = shop.district ?? null;
    if (dto.province !== undefined || dto.district !== undefined) {
      const provIn = dto.province !== undefined ? dto.province : province;
      if (!provIn) {
        province = null;
        district = null;
      } else {
        const canon = this.geo.canonicalProvince(provIn);
        if (!canon) throw new BadRequestException('İl listeden seçilmelidir.');
        province = canon;
        const distIn = dto.district !== undefined ? dto.district : dto.province !== undefined ? null : district;
        if (distIn) {
          const dcanon = this.geo.canonicalDistrict(canon, distIn);
          if (!dcanon) throw new BadRequestException(`"${canon}" iline ait bir ilçe seçin.`);
          district = dcanon;
        } else {
          district = null;
        }
      }
    }

    if (dto.name !== undefined) shop.name = dto.name;
    if (dto.legalName !== undefined) shop.legalName = dto.legalName;
    if (dto.contactPerson !== undefined) shop.contactPerson = dto.contactPerson;
    if (dto.phone !== undefined) shop.phone = dto.phone;
    if (dto.email !== undefined) shop.email = dto.email;
    if (dto.website !== undefined) shop.website = dto.website;
    if (dto.addressLine !== undefined) shop.addressLine = dto.addressLine;
    if (dto.description !== undefined) shop.description = dto.description;
    shop.province = province;
    shop.district = district;
    if (dto.shareDebtInfo !== undefined) shop.shareDebtInfo = dto.shareDebtInfo;
    if (dto.shareCustomerInfo !== undefined) shop.shareCustomerInfo = dto.shareCustomerInfo;

    let labelIds: string[] | undefined;
    if (dto.labelIds !== undefined) {
      labelIds = [...new Set(dto.labelIds)];
      await this.labels.assertUsable(labelIds);
    }

    if (dto.directoryVisible !== undefined) shop.directoryVisible = dto.directoryVisible;
    if (shop.directoryVisible) {
      const currentLabels = labelIds ?? (await this.get(shopId)).labelIds;
      const missing = this.missing(shop, currentLabels.length);
      if (missing.length) {
        throw new BadRequestException(`Rehberde görünmek için şunları doldurun: ${missing.join(', ')}.`);
      }
    }

    await this.dataSource.transaction(async (m) => {
      await m.save(shop);
      if (labelIds) {
        await m.delete(ShopLabel, { shopId });
        for (const labelId of labelIds) await m.save(m.create(ShopLabel, { shopId, labelId }));
      }
    });
    return this.get(shopId);
  }

  private missing(shop: Shop, labelCount: number): string[] {
    const out: string[] = [];
    if (!shop.province) out.push('il');
    if (!shop.district) out.push('ilçe');
    if (!shop.phone && !shop.email) out.push('telefon ya da e-posta');
    if (labelCount === 0) out.push('en az bir iş kolu');
    return out;
  }

  private view(shop: Shop, labels: { id: string; name: string }[]): BusinessProfileView {
    return {
      id: shop.id,
      name: shop.name,
      legalName: shop.legalName ?? null,
      contactPerson: shop.contactPerson ?? null,
      phone: shop.phone ?? null,
      email: shop.email ?? null,
      website: shop.website ?? null,
      province: shop.province ?? null,
      district: shop.district ?? null,
      addressLine: shop.addressLine ?? null,
      description: shop.description ?? null,
      directoryVisible: shop.directoryVisible,
      shareDebtInfo: shop.shareDebtInfo,
      shareCustomerInfo: shop.shareCustomerInfo,
      labelIds: labels.map((l) => l.id),
      labels,
      status: shop.status,
      plan: shop.plan,
      subscriptionUntil: shop.subscriptionUntil ?? null,
      missingForDirectory: this.missing(shop, labels.length),
    };
  }
}

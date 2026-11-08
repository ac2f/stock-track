import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { PARTNER_PERMISSIONS, PartnerPermission } from '../entities/shop-partner-grant.entity';
import {
  STOCK_SHARE_KINDS,
  STOCK_SHARE_VISIBILITY,
  StockShareKind,
  StockShareVisibility,
} from '../entities/shop-stock-share.entity';
import { ShopTransferItemDto } from './create-shop-transfer.dto';

/** Alıcı olarak satıcıdan alım talebi: kalemler satıcının "paylaşılan stok" listesinden seçilir. */
export class RequestShopTransferDto {
  /** Malzemeyi alacağımız (satıcı) işletme. */
  @IsUUID()
  fromShopId: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShopTransferItemDto)
  items: ShopTransferItemDto[];
}

/** Onay/ret/iptal talebi notu; satıcı onaylıyorsa kendi çıkış deposunu seçebilir. */
export class TransferDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class PartnerSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class UpsertPartnerGrantDto {
  @IsUUID()
  granteeShopId: string;

  @IsIn([...PARTNER_PERMISSIONS])
  permission: PartnerPermission;

  /** Bitiş zamanı (ISO); boş/null = süresiz. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class UpsertStockShareDto {
  @IsIn([...STOCK_SHARE_KINDS])
  kind: StockShareKind;

  @IsUUID()
  refId: string;

  @IsOptional()
  @IsIn([...STOCK_SHARE_VISIBILITY])
  visibility?: StockShareVisibility;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class UpdateStockShareDto {
  @IsOptional()
  @IsIn([...STOCK_SHARE_VISIBILITY])
  visibility?: StockShareVisibility;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class SetAllStockSharesDto {
  @IsBoolean()
  isActive: boolean;
}

export class ListingQueryDto extends PaginationDto {
  /** Yalnız bu işletmenin listesi. */
  @IsOptional()
  @IsUUID()
  shopId?: string;

  /** Malzeme türü (ad) süzgeci. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

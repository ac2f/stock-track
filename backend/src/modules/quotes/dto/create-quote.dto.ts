import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MeasurementType } from '../../../common/enums/measurement-type.enum';
import {
  OwnerSettlementType,
  SaleStockSource,
} from '../../../common/enums/sale-source.enum';
import { QuoteLineKind } from '../../../common/enums/quote-status.enum';
import { BatchPlateItemDto } from '../../materials/dto/batch-create-plates.dto';

export class QuoteItemDto {
  @IsEnum(QuoteLineKind)
  lineKind: QuoteLineKind;

  // Stoktaki bir malzeme seçildiğinde plaka kimliği. Serbest (stoksuz) kalemde
  // boş bırakılır; bu durumda itemName + ölçü/fiyat ile satılır.
  @IsOptional()
  @IsUUID()
  plateId?: string;

  // Serbest (stoksuz) kalemde malzemenin adı — fiş/ekstrede görünür.
  @IsOptional()
  @IsString()
  itemName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  // SALE: birim satış fiyatı; PROCESSING: birim işleme ücreti (rate).
  @IsNumber()
  @Min(0)
  unitPrice: number;

  // Kaleme özel işlenme/tamamlanma tarihi (opsiyonel). Dönüşümde işleme işinin
  // processedAt'ine (ve tamamlanmış eklenirse completedAt'ine) / satışın
  // saleDate'ine yansır.
  @IsOptional()
  @IsDateString()
  itemDate?: string;

  /**
   * Teklifi kaydederken AYNI İŞLEMDE stoğa eklenecek malzeme ("işe özel
   * malzeme", müşterinin X tarihinde getirdiği levha…). Ürün türü kimlikle ya
   * da adla verilir (yoksa açılır); `addedAt` malzemenin geliş tarihidir.
   * Verilirse plateId yerine kullanılır: oluşan stok kalemi bu kalemin
   * malzemesi olur.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => BatchPlateItemDto)
  newMaterial?: BatchPlateItemDto;

  // ── PROCESSING kalemi ──
  @IsOptional()
  @IsEnum(MeasurementType)
  billingUnit?: MeasurementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  widthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthMeters?: number;

  // TIME birimi: işin toplam süresi (dakika). Asgari süre sunucuda uygulanır.
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;

  // ── SALE kalemi ──
  @IsOptional()
  @IsEnum(SaleStockSource)
  stockSource?: SaleStockSource;

  @IsOptional()
  @IsEnum(OwnerSettlementType)
  ownerSettlement?: OwnerSettlementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ownerAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;
}

export class CreateQuoteDto {
  @IsUUID()
  buyerCustomerId: string;

  @IsOptional()
  @IsUUID()
  ownerCustomerId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** Teklif tarihi (geriye dönük giriş). Boşsa şimdi. */
  @IsOptional()
  @IsDateString()
  quoteDate?: string;

  /**
   * Runner bu teklif için kendiliğinden klasör açmasın. Verilmezse: teklif
   * tarihi bugünden önceyse true (geriye dönük kayıt), değilse false.
   */
  @IsOptional()
  @IsBoolean()
  skipFolders?: boolean;

  /**
   * Kaydederken tek adımda ilerlet (yeni teklifte): 'convert' → kabul et ve
   * satış/işleme kayıtlarına dönüştür; 'complete' → bunlara ek olarak işleme
   * işlerini kalem tarihleriyle TAMAMLANMIŞ yap. Geriye dönük girişte üç
   * ayrı tıklama yerine tek tık.
   */
  @IsOptional()
  @IsIn(['convert', 'complete'])
  finalize?: 'convert' | 'complete';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items: QuoteItemDto[];
}

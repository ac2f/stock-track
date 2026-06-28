import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import {
  MeasurementType,
  UnitOfMeasure,
} from '../../../common/enums/measurement-type.enum';

/**
 * Stok kalemi oluşturma. Yalnızca templateId zorunludur; ölçüm tipi, birim,
 * en/boy/kalınlık/marka/renk verilmezse şablonun varsayılanlarından miras alınır.
 * Rulo/şerit (LENGTH) malzemede en/boy gerekmez; yükseklik/malzeme `attributes`'ta.
 */
export class CreatePlateDto {
  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsEnum(MeasurementType)
  measurementType?: MeasurementType;

  @IsOptional()
  @IsEnum(UnitOfMeasure)
  unitOfMeasure?: UnitOfMeasure;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  // Kategori bazlı kataloglardan seçilir; verilmezse şablonun varsayılanından
  // miras alınır. Sunucu, kataloğun şablonun kategorisiyle eşleştiğini doğrular.
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsUUID()
  colorId?: string;

  @IsOptional()
  @IsUUID()
  sizeId?: string;

  @IsOptional()
  @IsUUID()
  thicknessId?: string;

  @IsOptional()
  @IsString()
  variant?: string;

  // Bu fiziksel parçanın güncel (kalan) ebadı. Verilmezse standart tabaka ebadından
  // miras alınır; verilirse standart tabaka ebadını aşamaz (servis doğrular).
  @IsOptional()
  @IsNumber()
  @Min(0)
  widthMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightMm?: number;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  // Konsinye sahibi (müşteri). Verilirse açılış stoğu işletmenin değil bu müşterinin
  // konsinye stoğu olarak yazılır. Boşsa stok işletmeye aittir.
  @IsOptional()
  @IsUUID()
  ownerCustomerId?: string;

  // Edinme (stoğa giriş) tarihi; verilmezse bugün. İşlenme tarihi opsiyoneldir.
  @IsOptional()
  @IsDateString()
  addedAt?: string;

  @IsOptional()
  @IsDateString()
  processedAt?: string;

  // Açılış stoğu (opsiyonel). Verilirse ilgili depoya stok olarak yazılır.
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityInStock?: number;

  // Açılış stoğunun gireceği depo; verilmezse varsayılan (Merkez) depo.
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;
}

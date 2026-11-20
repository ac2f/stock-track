import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Kesim raporundaki bir tabaka (iyiCAM'deki bir sac). Ölçüler mm. */
export class CutReportSheetDto {
  @IsOptional()
  @IsUUID()
  plateId?: string | null;

  @IsOptional()
  @IsUUID()
  quoteItemId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  label?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  thicknessMm?: number | null;

  @IsNumber()
  @Min(1)
  @Max(100000)
  sheetWidthMm: number;

  @IsNumber()
  @Min(1)
  @Max(100000)
  sheetHeightMm: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  usedWidthMm?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  usedHeightMm?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
  offcutWidthMm?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
  offcutHeightMm?: number | null;
}

/** iyiCAM'in (iyi ext pack) gönderdiği kesim raporu. */
export class CutReportDto {
  @IsString()
  @MaxLength(120)
  host: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  project?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  folder?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  minutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  toolpaths?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  areaM2?: number | null;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CutReportSheetDto)
  sheets: CutReportSheetDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  files?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

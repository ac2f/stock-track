import { IsBoolean, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateMaterialSizeDto {
  @IsNumber()
  @Min(0)
  widthMm: number;

  @IsNumber()
  @Min(0)
  heightMm: number;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

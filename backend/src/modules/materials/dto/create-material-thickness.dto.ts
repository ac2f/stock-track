import { IsBoolean, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateMaterialThicknessDto {
  @IsNumber()
  @Min(0)
  valueMm: number;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

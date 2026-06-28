import { IsBoolean, IsOptional, IsUUID, MinLength } from 'class-validator';
import { IsString } from 'class-validator';

export class CreateMaterialBrandDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

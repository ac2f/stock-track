import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @MinLength(2)
  plateNumber: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

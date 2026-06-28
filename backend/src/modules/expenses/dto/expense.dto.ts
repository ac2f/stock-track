import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateExpenseCategoryDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  // Sürekli gider için aylık tutar ve ayın günü (vade).
  @IsOptional()
  @IsNumber()
  @Min(0)
  recurringAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  recurringDayOfMonth?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdateExpenseCategoryDto extends PartialType(
  CreateExpenseCategoryDto,
) {}

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export class CreateExpenseDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  // Verilmezse bugün.
  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class QueryExpenseDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

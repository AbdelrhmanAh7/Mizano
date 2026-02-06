import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsDateString,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChallanType, ChallanStatus } from '@prisma/client';

// ============ Line Item DTOs ============

export class CreateChallanLineDto {
  @ApiProperty({ description: 'Item ID' })
  @IsString()
  itemId: string;

  @ApiProperty({ description: 'Quantity to deliver' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ description: 'Line description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Source warehouse ID' })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}

// ============ Create/Update DTOs ============

export class CreateDeliveryChallanDto {
  @ApiProperty({ description: 'Customer ID' })
  @IsString()
  customerId: string;

  @ApiPropertyOptional({ description: 'Linked Invoice ID' })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiProperty({ enum: ChallanType, description: 'Type of challan' })
  @IsEnum(ChallanType)
  challanType: ChallanType;

  @ApiProperty({ description: 'Challan date' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateChallanLineDto], description: 'Line items' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChallanLineDto)
  lines: CreateChallanLineDto[];
}

export class UpdateDeliveryChallanDto {
  @ApiPropertyOptional({ description: 'Customer ID' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Linked Invoice ID' })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiPropertyOptional({ enum: ChallanType, description: 'Type of challan' })
  @IsOptional()
  @IsEnum(ChallanType)
  challanType?: ChallanType;

  @ApiPropertyOptional({ description: 'Challan date' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [CreateChallanLineDto], description: 'Line items' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChallanLineDto)
  lines?: CreateChallanLineDto[];
}

// ============ Query DTOs ============

export class ChallanQueryDto {
  @ApiPropertyOptional({ enum: ChallanStatus })
  @IsOptional()
  @IsEnum(ChallanStatus)
  status?: ChallanStatus;

  @ApiPropertyOptional({ enum: ChallanType })
  @IsOptional()
  @IsEnum(ChallanType)
  challanType?: ChallanType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;
}

// ============ Response DTOs ============

export class ChallanLineResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  itemId: string;

  @ApiProperty()
  quantity: number;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  warehouseId?: string;

  @ApiPropertyOptional()
  item?: {
    id: string;
    name: string;
    sku: string;
  };

  @ApiPropertyOptional()
  warehouse?: {
    id: string;
    name: string;
  };
}

export class DeliveryChallanResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  challanNumber: string;

  @ApiProperty()
  customerId: string;

  @ApiPropertyOptional()
  invoiceId?: string;

  @ApiProperty({ enum: ChallanType })
  challanType: ChallanType;

  @ApiProperty()
  date: Date;

  @ApiProperty({ enum: ChallanStatus })
  status: ChallanStatus;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  customer?: {
    id: string;
    name: string;
  };

  @ApiPropertyOptional()
  invoice?: {
    id: string;
    invoiceNumber: string;
  };

  @ApiPropertyOptional({ type: [ChallanLineResponse] })
  lines?: ChallanLineResponse[];
}

export class ChallanListResponse {
  @ApiProperty({ type: [DeliveryChallanResponse] })
  data: DeliveryChallanResponse[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

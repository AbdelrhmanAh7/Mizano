import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CheckDuplicateBillDto {
  @IsString()
  vendorId: string;

  @IsOptional()
  @IsString()
  billNumber?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  date?: string;
}

import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAccountSettingsDto {
  @ApiProperty({ required: false, description: 'Default Accounts Receivable account ID' })
  @IsString()
  @IsOptional()
  defaultArAccountId?: string;

  @ApiProperty({ required: false, description: 'Default Sales Revenue account ID' })
  @IsString()
  @IsOptional()
  defaultRevenueAccountId?: string;

  @ApiProperty({ required: false, description: 'Default VAT Payable account ID' })
  @IsString()
  @IsOptional()
  defaultVatPayableAccountId?: string;

  @ApiProperty({ required: false, description: 'Default Accounts Payable account ID' })
  @IsString()
  @IsOptional()
  defaultApAccountId?: string;

  @ApiProperty({ required: false, description: 'Default VAT Receivable account ID' })
  @IsString()
  @IsOptional()
  defaultVatReceivableAccountId?: string;

  @ApiProperty({ required: false, description: 'Default Bank account ID' })
  @IsString()
  @IsOptional()
  defaultBankAccountId?: string;

  @ApiProperty({ required: false, description: 'Default Cash account ID' })
  @IsString()
  @IsOptional()
  defaultCashAccountId?: string;

  @ApiProperty({ required: false, description: 'Default Sales Returns account ID' })
  @IsString()
  @IsOptional()
  defaultSalesReturnsAccountId?: string;
}

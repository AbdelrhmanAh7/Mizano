import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { BulkIdsDto } from '../../../common/dto/bulk-ids.dto';

export class BulkPayInvoicesDto extends BulkIdsDto {
  @ApiPropertyOptional({ description: 'Defaults to the organization default bank/cash account' })
  @IsOptional()
  @IsString()
  depositToAccountId?: string;

  @ApiPropertyOptional({ description: 'Payment date (defaults to today)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ enum: PaymentMode })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;
}

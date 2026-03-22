import { IsString, IsOptional, IsBoolean, IsArray, IsObject, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

export class UpdateBankRuleDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  bankAccountId?: string;

  @ApiProperty({ required: false, type: [Object] })
  @IsArray()
  @IsOptional()
  conditions?: Prisma.InputJsonValue;

  @ApiProperty({ required: false, type: Object })
  @IsObject()
  @IsOptional()
  action?: Prisma.InputJsonValue;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

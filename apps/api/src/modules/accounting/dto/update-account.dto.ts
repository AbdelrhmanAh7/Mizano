import { IsString, IsOptional, IsBoolean, MaxLength, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAccountDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  code?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  parentId?: string | null;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

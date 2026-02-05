import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class JournalLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty({ default: '0' })
  @IsString()
  @IsOptional()
  debit?: string;

  @ApiProperty({ default: '0' })
  @IsString()
  @IsOptional()
  credit?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}

export class CreateJournalDto {
  @ApiProperty()
  @IsDateString()
  date: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ type: [JournalLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(2)
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}

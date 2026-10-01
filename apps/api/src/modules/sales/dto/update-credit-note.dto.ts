import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Posted credit notes are immutable: only the free-text reason can change. Date, amount, type
 * and invoice are fixed by the journal posted at creation.
 */
export class UpdateCreditNoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

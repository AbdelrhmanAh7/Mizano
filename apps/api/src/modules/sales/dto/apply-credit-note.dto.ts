import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ApplyCreditNoteDto {
  @ApiProperty({ description: 'Invoice whose balance due the credit note is applied against' })
  @IsString()
  invoiceId: string;
}

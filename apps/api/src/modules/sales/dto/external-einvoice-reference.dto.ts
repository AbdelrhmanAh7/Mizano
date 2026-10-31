import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

/** A separate metadata command: it can never accept amounts or posting fields. */
export class ExternalEInvoiceReferenceDto {
  @ApiProperty({
    nullable: true,
    maxLength: 100,
    description: 'External ETA number or UUID; null clears it',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(100)
  externalEInvoiceNumber: string | null;
}

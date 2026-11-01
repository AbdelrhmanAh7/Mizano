import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { MATCH_ENTITY_TYPES, MatchEntityType } from '../services/reconciliation.service';

/** POST /reconciliation/confirm: a pending bank line and the document or payment it is. */
export class ConfirmMatchDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  transactionId!: string;

  @ApiProperty({ enum: MATCH_ENTITY_TYPES })
  @IsIn(MATCH_ENTITY_TYPES)
  entityType!: MatchEntityType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  entityId!: string;
}

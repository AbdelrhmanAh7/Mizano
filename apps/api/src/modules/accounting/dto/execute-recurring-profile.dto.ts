import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ExecuteRecurringProfileDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'One key per user action. A retried request with the same key returns the original result instead of posting again.',
  })
  @IsUUID()
  idempotencyKey: string;
}

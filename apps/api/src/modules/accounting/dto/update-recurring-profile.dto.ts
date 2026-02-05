import { PartialType } from '@nestjs/swagger';
import { CreateRecurringProfileDto } from './create-recurring-profile.dto';

export class UpdateRecurringProfileDto extends PartialType(CreateRecurringProfileDto) {}

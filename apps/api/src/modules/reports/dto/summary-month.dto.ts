import { Matches } from 'class-validator';

/** A calendar month, YYYY-MM. */
export class SummaryMonthDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month!: string;
}

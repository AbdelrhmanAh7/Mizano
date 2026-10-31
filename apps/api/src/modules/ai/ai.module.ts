import { Module } from '@nestjs/common';
import { AiAccountModule } from './account/ai-account.module';
import { AiOperationsModule } from './operations/ai-operations.module';

/**
 * AI through the organization's own account (docs/plans/ai-own-accounts.md): the settings and
 * call gateway (AiAccountModule) and invoice intake (AiOperationsModule), whose CPU rules reader
 * works without any AI account.
 */
@Module({
  imports: [AiAccountModule, AiOperationsModule],
  exports: [AiAccountModule, AiOperationsModule],
})
export class AiModule {}

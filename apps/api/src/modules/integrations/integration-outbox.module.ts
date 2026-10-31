import { Global, Module } from '@nestjs/common';
import { WebhookOutboxService } from './services/webhook-outbox.service';

/**
 * Global so the sales services can write outbox events inside their own transactions without
 * importing IntegrationsModule (which imports SalesModule: no cycle). Their injection is
 * @Optional, so processes that do not load this module (the intake worker) simply emit nothing.
 */
@Global()
@Module({
  providers: [WebhookOutboxService],
  exports: [WebhookOutboxService],
})
export class IntegrationOutboxModule {}

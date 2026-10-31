import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { SalesModule } from '../sales/sales.module';
import { IntegrationApiController } from './controllers/integration-api.controller';
import { IntegrationSettingsController } from './controllers/integration-settings.controller';
import { IntegrationApiKeyGuard } from './guards/integration-api-key.guard';
import { IntegrationOutboxModule } from './integration-outbox.module';
import { integrationRequestContext } from './integration-request-context';
import { IntegrationApiService } from './services/integration-api.service';
import { IntegrationSettingsService } from './services/integration-settings.service';
import { OverdueScannerService } from './services/overdue-scanner.service';
import { WebhookDispatcherService } from './services/webhook-dispatcher.service';

/** Opens the per-request store the API-key guard fills (see integration-request-context). */
export function integrationContextMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  integrationRequestContext.run({}, () => next());
}

@Module({
  imports: [IntegrationOutboxModule, SalesModule],
  controllers: [IntegrationApiController, IntegrationSettingsController],
  providers: [
    IntegrationApiKeyGuard,
    IntegrationApiService,
    IntegrationSettingsService,
    WebhookDispatcherService,
    OverdueScannerService,
  ],
  exports: [WebhookDispatcherService, OverdueScannerService],
})
export class IntegrationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(integrationContextMiddleware).forRoutes(IntegrationApiController);
  }
}

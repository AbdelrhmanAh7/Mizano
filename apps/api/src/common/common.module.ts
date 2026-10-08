import { Global, Module } from '@nestjs/common';
import { DocumentNumberService } from './services/document-number.service';
import { TrustProxyService } from './services/trust-proxy.service';

@Global()
@Module({
  providers: [DocumentNumberService, TrustProxyService],
  exports: [DocumentNumberService],
})
export class CommonModule {}

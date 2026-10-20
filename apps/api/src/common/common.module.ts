import { Global, Module } from '@nestjs/common';
import { CredentialAgeCheckService } from './credentials/credential-age-check.service';
import { DocumentNumberService } from './services/document-number.service';

@Global()
@Module({
  providers: [DocumentNumberService, CredentialAgeCheckService],
  exports: [DocumentNumberService],
})
export class CommonModule {}

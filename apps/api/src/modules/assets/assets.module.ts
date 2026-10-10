import { Module } from '@nestjs/common';
import { AssetsController } from './controllers/assets.controller';
import { AssetsService } from './services/assets.service';
import { DepreciationService } from './services/depreciation.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [AssetsController],
  providers: [AssetsService, DepreciationService],
  exports: [AssetsService, DepreciationService],
})
export class AssetsModule {}

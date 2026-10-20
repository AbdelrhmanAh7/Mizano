import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AssetsController } from './controllers/assets.controller';
import { AssetsService } from './services/assets.service';
import { DepreciationService } from './services/depreciation.service';

@Module({
  imports: [AccountingModule],
  controllers: [AssetsController],
  providers: [AssetsService, DepreciationService],
  exports: [AssetsService, DepreciationService],
})
export class AssetsModule {}

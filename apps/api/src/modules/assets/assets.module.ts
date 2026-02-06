import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AssetsController } from './controllers/assets.controller';
import { AssetsService } from './services/assets.service';
import { DepreciationService } from './services/depreciation.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AssetsController],
  providers: [AssetsService, DepreciationService],
  exports: [AssetsService, DepreciationService],
})
export class AssetsModule {}

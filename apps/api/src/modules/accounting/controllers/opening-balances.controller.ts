import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentOrg, InvalidatesLedger, Permissions } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CacheInvalidationInterceptor } from '../../../common/interceptors/cache-invalidation.interceptor';
import { OpeningBalancesStepDto } from '../../organizations/dto/onboarding.dto';
import { OpeningBalancesService } from '../services/opening-balances.service';

/**
 * Onboarding step "opening balances". Lives in the accounting module because it posts to the
 * ledger through JournalsService; the URL is unchanged from the original organization route.
 */
@ApiTags('Organization')
@ApiBearerAuth()
@Controller('organization/onboarding/opening-balances')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(CacheInvalidationInterceptor)
export class OpeningBalancesController {
  constructor(private readonly openingBalancesService: OpeningBalancesService) {}

  @Post()
  @Permissions('settings.edit', 'accounting.create')
  @InvalidatesLedger('organization:*')
  @ApiOperation({
    summary: 'Post opening balances as one balanced journal and complete the onboarding step',
  })
  post(@CurrentOrg() orgId: string, @Body() dto: OpeningBalancesStepDto) {
    return this.openingBalancesService.post(orgId, dto);
  }
}

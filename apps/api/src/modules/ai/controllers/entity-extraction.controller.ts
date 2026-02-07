import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { EntityExtractionService } from '../services/entity-extraction.service';
import {
  ExtractEntitiesDto,
  ExtractionResultDto,
  MatchResultDto,
} from '../dto/entity-extraction.dto';

@ApiTags('AI - Entity Extraction')
@ApiBearerAuth()
@Controller('ai/entities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EntityExtractionController {
  constructor(private entityExtractionService: EntityExtractionService) {}

  @Post('extract')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Extract named entities from text' })
  @ApiResponse({
    status: 200,
    description: 'Returns extracted entities grouped by type',
    type: ExtractionResultDto,
  })
  async extractEntities(
    @Body() body: ExtractEntitiesDto,
  ): Promise<{ data: ExtractionResultDto }> {
    const result = await this.entityExtractionService.extractEntities(body.text);
    return { data: result };
  }

  @Post('extract-and-match')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Extract entities and match them to existing records' })
  @ApiResponse({
    status: 200,
    description: 'Returns extracted entities matched to database records',
    type: [MatchResultDto],
  })
  async extractAndMatch(
    @CurrentOrg() orgId: string,
    @Body() body: ExtractEntitiesDto,
  ) {
    const result = await this.entityExtractionService.extractAndMatch(
      orgId,
      body.text,
    );
    return { data: result };
  }
}

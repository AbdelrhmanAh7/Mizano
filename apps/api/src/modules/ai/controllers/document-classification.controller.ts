import {
  Controller,
  Get,
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
import { DocumentClassificationService } from '../services/document-classification.service';
import {
  ClassifyDocumentDto,
  ClassificationResultDto,
  ModelStatusDto,
} from '../dto/document-classification.dto';

@ApiTags('AI - Document Classification')
@ApiBearerAuth()
@Controller('ai/documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentClassificationController {
  constructor(private documentClassificationService: DocumentClassificationService) {}

  @Post('classify')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Classify a document using AI' })
  @ApiResponse({
    status: 200,
    description: 'Returns document classification with confidence scores',
    type: ClassificationResultDto,
  })
  async classifyDocument(
    @CurrentOrg() orgId: string,
    @Body() body: ClassifyDocumentDto,
  ) {
    const result = await this.documentClassificationService.classifyDocument(
      orgId,
      body.text,
      body.filename,
    );
    return { data: result };
  }

  @Post('train')
  @Permissions('accounting.manage')
  @ApiOperation({ summary: 'Train or retrain the document classification model' })
  @ApiResponse({
    status: 200,
    description: 'Model trained successfully',
  })
  async trainModel(
    @CurrentOrg() orgId: string,
  ) {
    const result = await this.documentClassificationService.trainModel(orgId);
    return { data: result };
  }

  @Get('ml-status')
  @Permissions('accounting.view')
  @ApiOperation({ summary: 'Get document classification model status' })
  @ApiResponse({
    status: 200,
    description: 'Returns ML model status and metadata',
    type: ModelStatusDto,
  })
  async getModelStatus(
    @CurrentOrg() orgId: string,
  ) {
    const status = await this.documentClassificationService.getModelStatus(orgId);
    return { data: status };
  }
}

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { OcrService } from '../services/ocr.service';
import { AiFeedbackService } from '../services/ai-feedback.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  OcrTrainingExtractDto,
  OcrTrainingSubmitDto,
  OcrBatchTrainingDto,
  OcrVendorHistoryQueryDto,
} from '../dto/ocr-training.dto';
import { createOcrFileFilter } from '../utils/file-upload.util';

@ApiTags('AI - OCR Training')
@ApiBearerAuth()
@Controller('ai/ocr-training')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OcrTrainingController {
  constructor(
    private ocrService: OcrService,
    private feedbackService: AiFeedbackService,
    private prisma: PrismaService,
  ) {}

  @Post('extract')
  @Permissions('ai.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: createOcrFileFilter(),
    }),
  )
  @ApiOperation({ summary: 'Extract fields from an image for training (no bill created)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        vendorId: { type: 'string' },
        language: { type: 'string' },
      },
      required: ['file'],
    },
  })
  async extractForTraining(
    @CurrentOrg() orgId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: OcrTrainingExtractDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const language = dto.language || 'eng+ara';
    const result = dto.vendorId
      ? await this.ocrService.extractWithVendorHints(orgId, dto.vendorId, file.buffer, language)
      : await this.ocrService.extractFromImage(file.buffer, language);

    return { data: result };
  }

  @Post('submit')
  @Permissions('ai.manage')
  @ApiOperation({ summary: 'Submit corrections for OCR layout learning' })
  async submitCorrections(@CurrentOrg() orgId: string, @Body() dto: OcrTrainingSubmitDto) {
    // 1. Enhanced layout learning with context patterns
    await this.ocrService.learnLayoutEnhanced(
      orgId,
      dto.vendorId,
      dto.rawText,
      dto.extractedFields,
      dto.correctedFields,
    );

    // 2. Store as training data
    await this.prisma.aiTrainingData.create({
      data: {
        feature: 'OCR_LAYOUT',
        organizationId: orgId,
        source: 'CORRECTION',
        inputData: {
          rawText: dto.rawText.slice(0, 2000), // bounded
          extractedFields: dto.extractedFields,
        } as import('@prisma/client').Prisma.InputJsonValue,
        label: JSON.stringify(dto.correctedFields),
      },
    });

    // 3. Log feedback
    await this.feedbackService.processFeedback(orgId, {
      feature: 'OCR_LAYOUT' as import('@prisma/client').AiFeature,
      aiSuggestion: dto.extractedFields,
      userAction: 'CORRECTED' as import('@prisma/client').AiFeedbackAction,
      userAnswer: JSON.stringify(dto.correctedFields),
      inputData: { vendorId: dto.vendorId },
    });

    // 4. Get updated sample count
    const layout = await this.prisma.vendorOcrLayout.findUnique({
      where: {
        organizationId_vendorId: {
          organizationId: orgId,
          vendorId: dto.vendorId,
        },
      },
      select: { sampleCount: true },
    });

    return {
      data: {
        message: 'Training data submitted successfully',
        vendorId: dto.vendorId,
        sampleCount: layout?.sampleCount || 1,
        isActive: (layout?.sampleCount || 0) >= 3,
      },
    };
  }

  @Post('batch')
  @Permissions('ai.manage')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: createOcrFileFilter(),
    }),
  )
  @ApiOperation({ summary: 'Batch extract fields from multiple images' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        vendorId: { type: 'string' },
        language: { type: 'string' },
      },
      required: ['files'],
    },
  })
  async batchExtract(
    @CurrentOrg() orgId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: OcrBatchTrainingDto,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const language = dto.language || 'eng+ara';
    const results = [];

    // Process sequentially to avoid memory spikes
    for (const file of files) {
      try {
        const extraction = dto.vendorId
          ? await this.ocrService.extractWithVendorHints(orgId, dto.vendorId, file.buffer, language)
          : await this.ocrService.extractFromImage(file.buffer, language);

        results.push({
          filename: file.originalname,
          extraction,
          error: null,
        });
      } catch (error: unknown) {
        results.push({
          filename: file.originalname,
          extraction: null,
          error: (error as Error).message || 'Extraction failed',
        });
      }
    }

    return { data: results };
  }

  @Get('vendor-history/:vendorId')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get OCR training history for a vendor' })
  async getVendorHistory(
    @CurrentOrg() orgId: string,
    @Param('vendorId') vendorId: string,
    @Query() query: OcrVendorHistoryQueryDto,
  ) {
    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const [layout, vendor, feedbackRecords, trainingDataCount] = await Promise.all([
      this.prisma.vendorOcrLayout.findUnique({
        where: {
          organizationId_vendorId: { organizationId: orgId, vendorId },
        },
      }),
      this.prisma.vendor.findFirst({
        where: { id: vendorId, organizationId: orgId },
        select: { id: true, displayName: true, name: true },
      }),
      this.prisma.aiFeedback.findMany({
        where: {
          organizationId: orgId,
          feature: 'OCR_LAYOUT',
          inputData: { path: ['vendorId'], equals: vendorId },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          createdAt: true,
          aiSuggestion: true,
          userAnswer: true,
          userAction: true,
        },
      }),
      this.prisma.aiTrainingData.count({
        where: {
          organizationId: orgId,
          feature: 'OCR_LAYOUT',
        },
      }),
    ]);

    return {
      data: {
        vendorId,
        vendorName: vendor?.displayName || vendor?.name || 'Unknown',
        layout: layout
          ? {
              fieldPositions: layout.fieldPositions,
              sampleCount: layout.sampleCount,
              lastUsedAt: layout.lastUsedAt,
              isActive: layout.sampleCount >= 3,
            }
          : null,
        corrections: feedbackRecords,
        trainingDataCount,
      },
    };
  }

  @Get('stats')
  @Permissions('ai.view')
  @ApiOperation({ summary: 'Get aggregate OCR training statistics' })
  async getOcrStats(@CurrentOrg() orgId: string) {
    const [layouts, totalFeedback, recentFeedback] = await Promise.all([
      this.prisma.vendorOcrLayout.findMany({
        where: { organizationId: orgId },
        select: { vendorId: true, sampleCount: true, lastUsedAt: true },
      }),
      this.prisma.aiFeedback.count({
        where: { organizationId: orgId, feature: 'OCR_LAYOUT' },
      }),
      this.prisma.aiFeedback.count({
        where: {
          organizationId: orgId,
          feature: 'OCR_LAYOUT',
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const totalLayouts = layouts.length;
    const activeLayouts = layouts.filter((l) => l.sampleCount >= 3).length;
    const totalSamples = layouts.reduce((sum, l) => sum + l.sampleCount, 0);
    const avgSampleCount = totalLayouts > 0 ? Math.round(totalSamples / totalLayouts) : 0;

    return {
      data: {
        totalVendorLayouts: totalLayouts,
        activeLayouts,
        totalSamples,
        avgSampleCount,
        totalFeedback,
        recentCorrections: recentFeedback,
      },
    };
  }
}

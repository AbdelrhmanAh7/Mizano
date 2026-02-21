import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { DocumentIntakeService } from '../services/document-intake.service';
import { ProcessDocumentDto, ConfirmIntakeDto } from '../dto/document-intake.dto';
import { createOcrFileFilter } from '../utils/file-upload.util';

@ApiTags('AI - Document Intake')
@ApiBearerAuth()
@Controller('ai/document-intake')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentIntakeController {
  constructor(private intakeService: DocumentIntakeService) {}

  @Post('process')
  @Permissions('purchases.create')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 15 * 1024 * 1024, // 15MB limit
      },
      fileFilter: createOcrFileFilter(),
    }),
  )
  @ApiOperation({
    summary: 'Process a document through the AI intake pipeline',
    description:
      'Upload an image or PDF to automatically extract invoice/bill data. ' +
      'The pipeline runs: text extraction → document classification → field extraction → ' +
      'vendor matching → duplicate detection. Returns all extracted data for user review.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Invoice/bill image or PDF file (max 15MB)',
        },
        language: {
          type: 'string',
          description: 'OCR language (default: eng+ara)',
        },
        forceType: {
          type: 'string',
          enum: ['BILL', 'INVOICE'],
          description: 'Force document type instead of auto-classification',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Document processed successfully with extracted data',
  })
  @ApiResponse({ status: 400, description: 'No file uploaded or invalid file type' })
  async processDocument(
    @CurrentOrg() orgId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ProcessDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const result = await this.intakeService.processDocument(
      orgId,
      file.buffer,
      file.mimetype,
      file.originalname,
      dto.language,
    );

    // If forceType is specified, override the classification
    if (dto.forceType) {
      result.documentType = dto.forceType;
    }

    return { data: result };
  }

  @Post('confirm')
  @Permissions('purchases.create')
  @ApiOperation({
    summary: 'Confirm extracted data and create a draft Bill or Invoice',
    description:
      'After the user reviews and optionally corrects the extracted data from /process, ' +
      'call this endpoint to create the actual draft Bill or Invoice. ' +
      'User corrections are fed back to improve future extraction accuracy.',
  })
  @ApiResponse({
    status: 201,
    description: 'Draft document created successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['bill', 'invoice'] },
            id: { type: 'string' },
            number: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing required fields (vendor/customer)' })
  async confirmDocument(@CurrentOrg() orgId: string, @Body() dto: ConfirmIntakeDto) {
    const result = await this.intakeService.confirmAndCreate(orgId, dto);
    return { data: result };
  }
}

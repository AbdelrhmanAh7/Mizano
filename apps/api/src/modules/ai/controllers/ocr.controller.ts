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
import { OcrService } from '../services/ocr.service';
import { OcrExtractDto, OcrLearnDto, DuplicateCheckDto } from '../dto/ocr-extract.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai/ocr')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OcrController {
  constructor(private ocrService: OcrService) {}

  @Post('extract')
  @Permissions('purchases.create')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/tiff',
          'application/pdf',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, TIFF, PDF'), false);
        }
      },
    }),
  )
  @ApiOperation({ summary: 'Extract invoice/bill fields from an image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Invoice/bill image file',
        },
        vendorId: {
          type: 'string',
          description: 'Optional vendor ID for layout learning',
        },
        language: {
          type: 'string',
          description: 'OCR language (default: eng+ara)',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Extracted fields from invoice',
    schema: {
      type: 'object',
      properties: {
        date: { type: 'string', nullable: true },
        total: { type: 'number', nullable: true },
        subtotal: { type: 'number', nullable: true },
        tax: { type: 'number', nullable: true },
        invoiceNumber: { type: 'string', nullable: true },
        vendorName: { type: 'string', nullable: true },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
              total: { type: 'number' },
            },
          },
        },
        ocrConfidence: { type: 'number' },
        rawText: { type: 'string' },
      },
    },
  })
  async extractFromImage(
    @CurrentOrg() orgId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: OcrExtractDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const language = dto.language || 'eng+ara';
    const result = dto.vendorId
      ? await this.ocrService.extractWithVendorHints(orgId, dto.vendorId, file.buffer, language)
      : await this.ocrService.extractFromImage(file.buffer, language);

    return {
      data: result,
    };
  }

  @Post('learn')
  @Permissions('purchases.manage')
  @ApiOperation({ summary: 'Submit corrections to learn vendor layout' })
  @ApiResponse({
    status: 200,
    description: 'Layout learning updated',
  })
  async learnLayout(@CurrentOrg() orgId: string, @Body() dto: OcrLearnDto) {
    const corrections: Record<string, any> = {};

    if (dto.date !== undefined) corrections.date = dto.date;
    if (dto.total !== undefined) corrections.total = dto.total;
    if (dto.subtotal !== undefined) corrections.subtotal = dto.subtotal;
    if (dto.tax !== undefined) corrections.tax = dto.tax;
    if (dto.invoiceNumber !== undefined)
      corrections.invoiceNumber = dto.invoiceNumber;
    if (dto.vendorName !== undefined) corrections.vendorName = dto.vendorName;

    await this.ocrService.learnLayout(orgId, dto.vendorId, corrections);

    return {
      message: 'Layout learning updated successfully',
      vendorId: dto.vendorId,
    };
  }

  @Post('check-duplicate')
  @Permissions('purchases.view')
  @ApiOperation({ summary: 'Check if an invoice might be a duplicate' })
  @ApiResponse({
    status: 200,
    description: 'Duplicate check result',
    schema: {
      type: 'object',
      properties: {
        isDuplicate: { type: 'boolean' },
        existingBills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              billNumber: { type: 'string' },
              amount: { type: 'number' },
              date: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async checkDuplicate(
    @CurrentOrg() orgId: string,
    @Body() dto: DuplicateCheckDto,
  ) {
    const result = await this.ocrService.checkDuplicate(
      orgId,
      dto.vendorId ?? null,
      dto.invoiceNumber ?? null,
      dto.amount ?? null,
    );

    return {
      data: result,
    };
  }

  @Post('extract-base64')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Extract fields from base64 encoded image' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imageData: {
          type: 'string',
          description: 'Base64 encoded image data',
        },
        vendorId: {
          type: 'string',
          description: 'Optional vendor ID for layout learning',
        },
        language: {
          type: 'string',
          description: 'OCR language (default: eng+ara)',
        },
      },
      required: ['imageData'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Extracted fields from invoice',
  })
  async extractFromBase64(
    @CurrentOrg() orgId: string,
    @Body() body: { imageData: string; vendorId?: string; language?: string },
  ) {
    if (!body.imageData) {
      throw new BadRequestException('No image data provided');
    }

    // Remove data URL prefix if present
    const base64Data = body.imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const language = body.language || 'eng+ara';
    const result = body.vendorId
      ? await this.ocrService.extractWithVendorHints(orgId, body.vendorId, buffer, language)
      : await this.ocrService.extractFromImage(buffer, language);

    return {
      data: result,
    };
  }
}

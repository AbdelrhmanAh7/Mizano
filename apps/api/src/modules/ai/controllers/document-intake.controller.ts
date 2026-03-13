import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Sse,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Observable, Subject, finalize, map } from 'rxjs';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { DocumentIntakeService, IntakeProgressEvent } from '../services/document-intake.service';
import { ProcessDocumentDto, ConfirmIntakeDto } from '../dto/document-intake.dto';
import { createOcrFileFilter } from '../utils/file-upload.util';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@ApiTags('AI - Document Intake')
@ApiBearerAuth()
@Controller('ai/document-intake')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentIntakeController {
  constructor(
    private intakeService: DocumentIntakeService,
    private eventEmitter: EventEmitter2,
  ) {}

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
    summary: 'Process a document through the AI intake pipeline (async)',
    description:
      'Upload an image or PDF. Returns a jobId immediately. ' +
      'Use GET /ai/document-intake/:jobId/progress for SSE progress streaming, ' +
      'or GET /ai/document-intake/:jobId/result for polling.',
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
    description: 'Document accepted — returns jobId for progress tracking',
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

    const jobId = this.intakeService.processDocumentAsync(
      orgId,
      file.buffer,
      file.mimetype,
      file.originalname,
      dto.language,
    );

    // Store forceType on the job for later result retrieval
    if (dto.forceType) {
      const job = this.intakeService.getJob(jobId);
      if (job) {
        (job as unknown as Record<string, unknown>).forceType = dto.forceType;
      }
    }

    return { data: { jobId } };
  }

  @Sse(':jobId/progress')
  @ApiOperation({ summary: 'Stream document intake progress via SSE' })
  streamProgress(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const job = this.intakeService.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Intake job ${jobId} not found`);
    }

    const subject = new Subject<IntakeProgressEvent>();

    const listener = (event: IntakeProgressEvent) => {
      subject.next(event);
      if (event.stage === 'complete' || event.stage === 'error') {
        setTimeout(() => subject.complete(), 500);
      }
    };

    this.eventEmitter.on(`document-intake.progress.${jobId}`, listener);

    // Send current state immediately
    const currentState: IntakeProgressEvent = {
      stage: job.status,
      progress: job.progress,
      result: job.result ?? undefined,
      error: job.error ?? undefined,
    };

    if (job.status === 'complete' || job.status === 'error') {
      setTimeout(() => {
        subject.next(currentState);
        subject.complete();
      }, 100);
    } else {
      setTimeout(() => subject.next(currentState), 50);
    }

    return subject.pipe(
      map((event) => ({
        data: event,
        id: `${event.progress}`,
        type: 'progress',
      })),
      finalize(() => {
        this.eventEmitter.removeListener(`document-intake.progress.${jobId}`, listener);
      }),
    );
  }

  @Get(':jobId/result')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Get document intake result (polling fallback)' })
  @ApiResponse({ status: 200, description: 'Job status and result' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  getResult(@Param('jobId') jobId: string) {
    const job = this.intakeService.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Intake job ${jobId} not found`);
    }

    return {
      data: {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        result: job.result,
        error: job.error,
      },
    };
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

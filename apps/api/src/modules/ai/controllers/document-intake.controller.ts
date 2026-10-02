import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Sse,
  StreamableFile,
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
import type { Response } from 'express';
import { IntakeJobStatus } from '@prisma/client';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OrganizationGuard } from '../../../common/guards/organization.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { CurrentOrg } from '../../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import {
  DocumentIntakeResult,
  DocumentIntakeService,
  IntakeProgressEvent,
} from '../services/document-intake.service';
import { IntakeJobOwnerGuard } from '../intake/intake-job-owner.guard';
import {
  IntakeJobsService,
  IntakeJobView,
  isTerminalStage,
  stageFor,
} from '../intake/intake-jobs.service';
import {
  ProcessDocumentDto,
  ConfirmIntakeDto,
  ListIntakeJobsDto,
} from '../dto/document-intake.dto';
import { createOcrFileFilter } from '../utils/file-upload.util';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

const SSE_POLL_MS = 1000;
const SSE_MAX_DURATION_MS = 10 * 60 * 1000;

@ApiTags('AI - Document Intake')
@ApiBearerAuth()
@Controller('ai/document-intake')
@UseGuards(JwtAuthGuard, OrganizationGuard, PermissionsGuard)
export class DocumentIntakeController {
  constructor(
    private intakeService: DocumentIntakeService,
    private jobs: IntakeJobsService,
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
    summary: 'Upload a document: stores the original and queues a durable intake job',
    description:
      'Upload an image or PDF. Returns the job immediately. The same file (SHA-256) uploaded ' +
      'again by the same organization returns the existing job (duplicate=true). ' +
      'Use GET /ai/document-intake/:jobId/progress (SSE) or GET /ai/document-intake/:jobId/result.',
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
        language: { type: 'string', description: 'OCR language (default: eng+ara)' },
        forceType: {
          type: 'string',
          enum: ['BILL', 'INVOICE'],
          description: 'Force document type instead of auto-classification',
        },
        strategy: {
          type: 'string',
          enum: ['fast', 'slow', 'ocr', 'hybrid', 'vlm', 'auto'],
          description: 'Scan mode',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Job accepted (or existing job for a duplicate file)' })
  @ApiResponse({ status: 400, description: 'No file uploaded or invalid file type' })
  @ApiResponse({ status: 429, description: 'Too many documents are waiting to be processed' })
  async processDocument(
    @CurrentOrg() orgId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ProcessDocumentDto,
  ): Promise<{ data: { jobId: string; status: IntakeJobStatus; duplicate: boolean } }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!orgId || !userId) {
      throw new BadRequestException('Authenticated organization and user are required');
    }

    const { job, duplicate } = await this.jobs.createFromUpload({
      organizationId: orgId,
      userId,
      buffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname,
      forceType: dto.forceType,
      strategy: dto.strategy,
    });

    return { data: { jobId: job.id, status: job.status, duplicate } };
  }

  @Get('jobs')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'List intake jobs of the current organization' })
  async listJobs(
    @CurrentOrg() orgId: string,
    @Query() query: ListIntakeJobsDto,
  ): ReturnType<IntakeJobsService['list']> {
    return this.jobs.list(orgId, {
      status: query.status as IntakeJobStatus | undefined,
      page: query.page,
      limit: query.limit,
    });
  }

  /**
   * Authenticated SSE stream of the durable job state. Browsers' EventSource
   * cannot send an Authorization header, so the web client consumes this with
   * fetch() + a stream reader. The stream is driven by the database, so it
   * survives a worker restart and only ever reads the caller's own jobs;
   * another organization's job id responds 404.
   */
  @Sse(':jobId/progress')
  @UseGuards(IntakeJobOwnerGuard)
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Stream document intake progress via SSE (authenticated)' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async streamProgress(
    @CurrentOrg() orgId: string,
    @Param('jobId') jobId: string,
  ): Promise<Observable<MessageEvent>> {
    await this.jobs.getForOrg(jobId, orgId); // 404 before the stream opens

    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let timer: NodeJS.Timeout | undefined;
      let lastKey = '';
      const deadline = Date.now() + SSE_MAX_DURATION_MS;

      const tick = async (): Promise<void> => {
        if (closed) return;
        try {
          const job = await this.jobs.getForOrg(jobId, orgId);
          const stage = stageFor(job);
          const key = `${job.status}:${job.progress}:${job.attempts}`;
          if (key !== lastKey) {
            lastKey = key;
            const terminal = isTerminalStage(stage);
            const event: IntakeProgressEvent & { status: IntakeJobStatus } = {
              stage,
              status: job.status,
              progress: job.progress,
              result:
                terminal && job.result
                  ? (job.result as unknown as DocumentIntakeResult)
                  : undefined,
              error: stage === 'error' ? (job.lastError ?? 'Processing failed') : undefined,
            };
            subscriber.next({ data: event, id: `${job.progress}`, type: 'progress' });
          }
          if (isTerminalStage(stage) || Date.now() > deadline) {
            subscriber.complete();
            return;
          }
        } catch {
          subscriber.error(new NotFoundException('Intake job not found'));
          return;
        }
        if (!closed) timer = setTimeout(() => void tick(), SSE_POLL_MS);
      };

      void tick();
      return () => {
        closed = true;
        if (timer) clearTimeout(timer);
      };
    });
  }

  @Get(':jobId/result')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Get document intake job state and result (polling fallback)' })
  @ApiResponse({ status: 200, description: 'Job status and result' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getResult(
    @CurrentOrg() orgId: string,
    @Param('jobId') jobId: string,
  ): Promise<{ data: IntakeJobView }> {
    const job = await this.jobs.getForOrg(jobId, orgId);
    return { data: this.jobs.toView(job, true) };
  }

  @Get(':jobId/original')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Download the preserved original document (authenticated)' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getOriginal(
    @CurrentOrg() orgId: string,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { job, buffer } = await this.jobs.readOriginal(jobId, orgId);
    res.set({
      'Content-Type': job.mimeType,
      'Content-Length': String(buffer.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(job.originalFileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buffer);
  }

  @Post(':jobId/retry')
  @Permissions('purchases.create')
  @ApiOperation({ summary: 'Retry a FAILED or DEAD_LETTER intake job' })
  @ApiResponse({ status: 409, description: 'Job is not in a retryable state' })
  async retryJob(
    @CurrentOrg() orgId: string,
    @Param('jobId') jobId: string,
  ): Promise<{ data: IntakeJobView }> {
    const job = await this.jobs.retry(jobId, orgId);
    return { data: this.jobs.toView(job, false) };
  }

  @Post('confirm')
  @Permissions('purchases.create')
  @ApiOperation({
    summary: 'Confirm extracted data and create a draft Bill or Invoice',
    description:
      'After the user reviews and optionally corrects the extracted data from /process, ' +
      'call this endpoint to create the actual draft Bill or Invoice. ' +
      'User corrections are fed back to improve future extraction accuracy. ' +
      'When jobId is given the job moves to APPROVED exactly once and links the draft.',
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
  @ApiResponse({
    status: 400,
    description:
      'Missing required fields, unresolved tax rate, or a referenced id that does not belong to the organization',
  })
  @ApiResponse({ status: 409, description: 'Intake job already approved or not ready' })
  async confirmDocument(
    @CurrentOrg() orgId: string,
    @Body() dto: ConfirmIntakeDto,
  ): Promise<{ data: { type: 'bill' | 'invoice'; id: string; number: string } }> {
    const { jobId, ...input } = dto;
    if (!jobId) {
      return { data: await this.intakeService.confirmAndCreate(orgId, input) };
    }
    // Replay-safe: only one confirm can move the job to APPROVED.
    const restore = await this.jobs.claimForApproval(jobId, orgId);
    try {
      const result = await this.intakeService.confirmAndCreate(orgId, input);
      await this.jobs.linkDraft(jobId, orgId, { type: result.type, id: result.id });
      return { data: result };
    } catch (error) {
      await this.jobs.releaseApproval(jobId, orgId, restore);
      throw error;
    }
  }
}

import { Controller, Get, NotFoundException, Param, Sse, UseGuards } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, Subject, finalize, map } from 'rxjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BulkOperationsService } from './bulk-operations.service';
import { BulkJobProgressDto } from './dto/bulk-operation.dto';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@ApiTags('Bulk Operations')
@ApiBearerAuth()
@Controller('bulk-operations')
@UseGuards(JwtAuthGuard)
export class BulkOperationsController {
  constructor(
    private readonly bulkOperationsService: BulkOperationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get(':jobId/status')
  @ApiOperation({ summary: 'Get bulk operation job status (polling fallback)' })
  getJobStatus(@Param('jobId') jobId: string): BulkJobProgressDto {
    const job = this.bulkOperationsService.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Bulk operation job ${jobId} not found`);
    }

    return {
      jobId: job.jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      progress: job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0,
      failures: job.failures.length > 0 ? job.failures : undefined,
    };
  }

  @Sse(':jobId/progress')
  @ApiOperation({ summary: 'Stream bulk operation progress via SSE' })
  streamProgress(@Param('jobId') jobId: string): Observable<MessageEvent> {
    const job = this.bulkOperationsService.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Bulk operation job ${jobId} not found`);
    }

    const subject = new Subject<BulkJobProgressDto>();

    const listener = (progress: BulkJobProgressDto) => {
      subject.next(progress);
      if (progress.status === 'completed' || progress.status === 'failed') {
        // Give the client time to receive the final message before completing
        setTimeout(() => subject.complete(), 500);
      }
    };

    this.eventEmitter.on(`bulk-operation.progress.${jobId}`, listener);

    // Send current state immediately
    const currentState: BulkJobProgressDto = {
      jobId: job.jobId,
      status: job.status,
      processed: job.processed,
      total: job.total,
      progress: job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0,
      failures: job.failures.length > 0 ? job.failures : undefined,
    };

    // If already completed, send final state and close
    if (job.status === 'completed' || job.status === 'failed') {
      setTimeout(() => {
        subject.next(currentState);
        subject.complete();
      }, 100);
    } else {
      setTimeout(() => subject.next(currentState), 50);
    }

    return subject.pipe(
      map((progress) => ({
        data: progress,
        id: `${progress.processed}`,
        type: 'progress',
      })),
      finalize(() => {
        this.eventEmitter.removeListener(`bulk-operation.progress.${jobId}`, listener);
      }),
    );
  }
}

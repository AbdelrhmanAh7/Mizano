import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { IntakeJobsService } from './intake-jobs.service';

/**
 * Rejects (404) before a handler runs unless `:jobId` belongs to the caller's organization.
 * Needed for SSE routes: once the stream has started the status code is already 200, so an
 * exception thrown inside the handler would surface as an in-band error event instead of a 404.
 */
@Injectable()
export class IntakeJobOwnerGuard implements CanActivate {
  constructor(private readonly jobs: IntakeJobsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params?: { jobId?: string };
      user?: { organizationId?: string };
    }>();
    await this.jobs.getForOrg(request.params?.jobId ?? '', request.user?.organizationId ?? '');
    return true;
  }
}

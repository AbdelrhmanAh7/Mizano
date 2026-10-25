import { BadRequestException, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AllExceptionsFilter } from '../../../common/filters/http-exception.filter';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TimesheetsService } from '../services/timesheets.service';
import { TimesheetsController } from './timesheets.controller';

describe('TimesheetsController.getWeeklySummary', () => {
  const user = { id: 'u1' } as any;
  const make = () => {
    const service = { getWeeklySummary: jest.fn().mockResolvedValue({}) };
    return { service, controller: new TimesheetsController(service as any) };
  };

  it('accepts weekStart', () => {
    const { service, controller } = make();
    controller.getWeeklySummary('org', user, '2026-03-09', undefined);
    expect(service.getWeeklySummary).toHaveBeenCalledWith('org', 'u1', '2026-03-09');
  });

  it('accepts weekStartDate as an alias', () => {
    const { service, controller } = make();
    controller.getWeeklySummary('org', user, undefined, '2026-03-09');
    expect(service.getWeeklySummary).toHaveBeenCalledWith('org', 'u1', '2026-03-09');
  });

  it('weekStart wins when both are sent', () => {
    const { service, controller } = make();
    controller.getWeeklySummary('org', user, '2026-03-02', '2026-03-09');
    expect(service.getWeeklySummary).toHaveBeenCalledWith('org', 'u1', '2026-03-02');
  });

  it('rejects with 400 when neither name is sent', () => {
    const { service, controller } = make();
    expect(() => controller.getWeeklySummary('org', user, undefined, undefined)).toThrow(
      BadRequestException,
    );
    expect(service.getWeeklySummary).not.toHaveBeenCalled();
  });

  it('400 body carries the standard validation code, message and weekStart error', () => {
    const { controller } = make();
    try {
      controller.getWeeklySummary('org', user, undefined, undefined);
      throw new Error('expected BadRequestException');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Validation Failed',
        errors: { weekStart: ['weekStart (or weekStartDate) is required'] },
      });
    }
  });
});

describe('GET /timesheets/weekly-summary (HTTP, with AllExceptionsFilter)', () => {
  let app: INestApplication;
  const service = { getWeeklySummary: jest.fn().mockResolvedValue({}) };

  beforeAll(async () => {
    const allow = {
      canActivate: (ctx: ExecutionContext) => {
        ctx.switchToHttp().getRequest().user = { id: 'u1', organizationId: 'org' };
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [TimesheetsController],
      providers: [{ provide: TimesheetsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('omitting both parameters returns the standard 400 validation response', async () => {
    const res = await request(app.getHttpServer()).get('/timesheets/weekly-summary').expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('Validation Failed');
    expect(res.body.details.weekStart).toEqual(['weekStart (or weekStartDate) is required']);
    expect(service.getWeeklySummary).not.toHaveBeenCalled();
  });
});

import {
  BadRequestException,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AllExceptionsFilter } from '../../../common/filters/http-exception.filter';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TimesheetsService } from '../services/timesheets.service';
import { APP_VALIDATION_OPTIONS } from '../../../test/helpers/validation-pipe';
import { TimesheetsController } from './timesheets.controller';

describe('TimesheetsController.getWeeklySummary', () => {
  const user = { id: 'u1' } as any;
  const make = () => {
    const service = { getWeeklySummary: jest.fn().mockResolvedValue({}) };
    return { service, controller: new TimesheetsController(service as any) };
  };

  it('accepts weekStart', () => {
    const { service, controller } = make();
    controller.getWeeklySummary('org', user, { weekStart: '2026-03-09' });
    expect(service.getWeeklySummary).toHaveBeenCalledWith('org', 'u1', '2026-03-09');
  });

  it('accepts weekStartDate as an alias', () => {
    const { service, controller } = make();
    controller.getWeeklySummary('org', user, { weekStartDate: '2026-03-09' });
    expect(service.getWeeklySummary).toHaveBeenCalledWith('org', 'u1', '2026-03-09');
  });

  it('weekStart wins when both are sent', () => {
    const { service, controller } = make();
    controller.getWeeklySummary('org', user, {
      weekStart: '2026-03-02',
      weekStartDate: '2026-03-09',
    });
    expect(service.getWeeklySummary).toHaveBeenCalledWith('org', 'u1', '2026-03-02');
  });

  it('rejects with 400 when neither name is sent', () => {
    const { service, controller } = make();
    expect(() => controller.getWeeklySummary('org', user, {})).toThrow(BadRequestException);
    expect(service.getWeeklySummary).not.toHaveBeenCalled();
  });

  it('400 body carries the standard validation code, message and weekStart error', () => {
    const { controller } = make();
    try {
      controller.getWeeklySummary('org', user, {});
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

describe('/timesheets over HTTP (app ValidationPipe and AllExceptionsFilter)', () => {
  let app: INestApplication;
  const service = {
    getWeeklySummary: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({ id: 't1' }),
    startTimer: jest.fn().mockResolvedValue({ id: 't2' }),
  };

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
    app.useGlobalPipes(new ValidationPipe(APP_VALIDATION_OPTIONS));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    // Booting a Nest app can exceed the 5 s default on a loaded CI host.
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('omitting both parameters returns the standard 400 validation response', async () => {
    const res = await request(app.getHttpServer())
      .get('/timesheets/weekly-summary')
      .set('Accept-Language', 'en')
      .expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('Validation Failed');
    expect(res.body.details.weekStart).toEqual(['weekStart (or weekStartDate) is required']);
    expect(service.getWeeklySummary).not.toHaveBeenCalled();
  });

  it('a malformed weekStart is a 400, not an invalid date in Prisma', async () => {
    const res = await request(app.getHttpServer())
      .get('/timesheets/weekly-summary?weekStart=monday')
      .set('Accept-Language', 'en')
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.details)).toEqual(['weekStart']);
  });

  it('a bad entry body is a 400 VALIDATION_ERROR with per-field details (was a 500)', async () => {
    const res = await request(app.getHttpServer())
      .post('/timesheets')
      .set('Accept-Language', 'en')
      .send({ projectId: 'p1', date: 'yesterday', hours: '-2', userId: 'someone-else' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('Validation Failed');
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['date', 'hours']));
    // The unknown field is refused too (the filter decides which key it is filed under).
    expect(JSON.stringify(res.body.details)).toContain('userId should not exist');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('a valid entry reaches the service as the DTO, scoped to the caller', async () => {
    await request(app.getHttpServer())
      .post('/timesheets')
      .set('Accept-Language', 'en')
      .send({ projectId: 'p1', taskId: 't1', date: '2026-10-31', hours: '1.50' })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(
      'org',
      'u1',
      expect.objectContaining({ projectId: 'p1', taskId: 't1', hours: '1.50' }),
    );
  });

  it('the timer body is validated too', async () => {
    const res = await request(app.getHttpServer())
      .post('/timesheets/timer/start')
      .set('Accept-Language', 'en')
      .send({ taskId: 't1' })
      .expect(400);
    expect(Object.keys(res.body.details)).toEqual(['projectId']);
    expect(service.startTimer).not.toHaveBeenCalled();
  });
});

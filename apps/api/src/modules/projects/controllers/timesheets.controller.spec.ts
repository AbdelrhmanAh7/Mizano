import { BadRequestException } from '@nestjs/common';
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

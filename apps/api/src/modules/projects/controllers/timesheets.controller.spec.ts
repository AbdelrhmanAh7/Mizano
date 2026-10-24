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
});

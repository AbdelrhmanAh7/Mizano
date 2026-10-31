import { pipeErrors, pipeTransform } from '../../../test/helpers/validation-pipe';
import {
  CreateTimesheetDto,
  StartTimerDto,
  TimesheetQueryDto,
  TimesheetReportQueryDto,
  UpdateTimesheetDto,
  WeeklySummaryQueryDto,
} from './timesheet.dto';

const fields = (messages: string[]): string[] => messages.map((m) => m.split(' ')[0]);

describe('Timesheet DTOs (through the app ValidationPipe)', () => {
  const valid = { projectId: 'p1', taskId: 't1', date: '2026-10-31', hours: '7.50' };

  it('accepts the entry the log-time form sends', async () => {
    expect(
      await pipeErrors(CreateTimesheetDto, { ...valid, description: 'Design review' }),
    ).toEqual([]);
    expect(await pipeErrors(CreateTimesheetDto, { ...valid, isBillable: false })).toEqual([]);
  });

  it('rejects a missing project or date, and float or over-precise hours', async () => {
    expect(
      fields(await pipeErrors(CreateTimesheetDto, { date: '2026-10-31', hours: '1' })),
    ).toEqual(expect.arrayContaining(['projectId']));
    expect(fields(await pipeErrors(CreateTimesheetDto, { ...valid, date: 'yesterday' }))).toContain(
      'date',
    );
    for (const hours of ['-1', -1, '1.255', 1.255, 'x', '123456789']) {
      expect(fields(await pipeErrors(CreateTimesheetDto, { ...valid, hours }))).toContain('hours');
    }
    expect(fields(await pipeErrors(CreateTimesheetDto, { ...valid, isBillable: 'no' }))).toContain(
      'isBillable',
    );
  });

  it('rejects tenant and ownership fields', async () => {
    expect(await pipeErrors(CreateTimesheetDto, { ...valid, userId: 'someone-else' })).toEqual([
      'property userId should not exist',
    ]);
    expect(await pipeErrors(CreateTimesheetDto, { ...valid, organizationId: 'org-2' })).toEqual([
      'property organizationId should not exist',
    ]);
    // An entry cannot be moved to another project, or marked billed, through an update.
    expect(await pipeErrors(UpdateTimesheetDto, { projectId: 'p2' })).toEqual([
      'property projectId should not exist',
    ]);
    expect(await pipeErrors(UpdateTimesheetDto, { isBilled: true })).toEqual([
      'property isBilled should not exist',
    ]);
  });

  it('allows partial updates', async () => {
    expect(await pipeErrors(UpdateTimesheetDto, { hours: '2' })).toEqual([]);
    expect(await pipeErrors(UpdateTimesheetDto, { description: 'more' })).toEqual([]);
    // A JSON number is converted to its decimal string first, then pattern-checked.
    expect(await pipeTransform(UpdateTimesheetDto, { hours: 2 })).toEqual({ hours: '2' });
    expect(fields(await pipeErrors(UpdateTimesheetDto, { hours: '2.125' }))).toContain('hours');
  });

  it('validates the start-timer body', async () => {
    expect(await pipeErrors(StartTimerDto, { projectId: 'p1', taskId: 't1' })).toEqual([]);
    expect(fields(await pipeErrors(StartTimerDto, {}))).toContain('projectId');
    expect(await pipeErrors(StartTimerDto, { projectId: 'p1', hours: '1' })).toEqual([
      'property hours should not exist',
    ]);
  });

  it('transforms list filters, reading isBilled strictly', async () => {
    expect(
      await pipeTransform(
        TimesheetQueryDto,
        { page: '2', limit: '20', projectId: 'p1', status: 'UNBILLED', isBilled: 'false' },
        'query',
      ),
    ).toMatchObject({ page: 2, limit: 20, projectId: 'p1', status: 'UNBILLED', isBilled: false });
    expect(fields(await pipeErrors(TimesheetQueryDto, { isBilled: 'maybe' }, 'query'))).toContain(
      'isBilled',
    );
    expect(fields(await pipeErrors(TimesheetQueryDto, { status: 'PAID' }, 'query'))).toContain(
      'status',
    );
    expect(fields(await pipeErrors(TimesheetQueryDto, { startDate: 'x' }, 'query'))).toContain(
      'startDate',
    );
  });

  it('validates the weekly summary and report queries', async () => {
    expect(await pipeErrors(WeeklySummaryQueryDto, { weekStart: '2026-10-26' }, 'query')).toEqual(
      [],
    );
    expect(
      fields(await pipeErrors(WeeklySummaryQueryDto, { weekStartDate: 'monday' }, 'query')),
    ).toContain('weekStartDate');
    expect(
      await pipeErrors(
        TimesheetReportQueryDto,
        { startDate: '2026-10-01', endDate: '2026-10-31', groupBy: 'project' },
        'query',
      ),
    ).toEqual([]);
    expect(
      fields(await pipeErrors(TimesheetReportQueryDto, { startDate: '2026-10-01' }, 'query')),
    ).toContain('endDate');
    expect(
      fields(
        await pipeErrors(
          TimesheetReportQueryDto,
          { startDate: '2026-10-01', endDate: '2026-10-31', groupBy: 'team' },
          'query',
        ),
      ),
    ).toContain('groupBy');
  });
});

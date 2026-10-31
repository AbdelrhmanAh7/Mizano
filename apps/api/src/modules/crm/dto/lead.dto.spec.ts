import { pipeErrors, pipeTransform } from '../../../test/helpers/validation-pipe';
import { ActivityQueryDto, CreateActivityDto, LogActivityDto } from './activity.dto';
import { CrmLimitQueryDto } from './crm-list-query.dto';
import {
  AssignCrmRecordDto,
  BulkAssignLeadsDto,
  ConvertLeadDto,
  CreateLeadDto,
  LeadCursorQueryDto,
  LeadQueryDto,
  UpdateLeadDto,
} from './lead.dto';

const fields = (messages: string[]): string[] => messages.map((m) => m.split(' ')[0]);

describe('Lead DTOs (through the app ValidationPipe)', () => {
  const valid = { leadName: 'Sara', source: 'REFERRAL' };

  it('accepts a complete lead', async () => {
    expect(
      await pipeErrors(CreateLeadDto, {
        ...valid,
        companyName: 'Delta Co',
        email: 'sara@delta.example',
        phone: '+201000000000',
        status: 'CONTACTED',
        notes: 'met at expo',
        customFields: { industry: 'retail' },
        assignedToId: 'user-1',
      }),
    ).toEqual([]);
  });

  it('rejects a missing name, a bad email and an unknown source or status', async () => {
    expect(fields(await pipeErrors(CreateLeadDto, { source: 'WEBSITE' }))).toContain('leadName');
    expect(fields(await pipeErrors(CreateLeadDto, { ...valid, email: 'nope' }))).toContain('email');
    // TRADE_SHOW and UNQUALIFIED were offered by the web but never existed in the schema.
    expect(fields(await pipeErrors(CreateLeadDto, { ...valid, source: 'TRADE_SHOW' }))).toContain(
      'source',
    );
    expect(fields(await pipeErrors(UpdateLeadDto, { status: 'UNQUALIFIED' }))).toContain('status');
    expect(fields(await pipeErrors(CreateLeadDto, { ...valid, customFields: 'x' }))).toContain(
      'customFields',
    );
  });

  it('rejects tenant and unknown fields on create and update', async () => {
    expect(await pipeErrors(CreateLeadDto, { ...valid, organizationId: 'org-2' })).toEqual([
      'property organizationId should not exist',
    ]);
    expect(await pipeErrors(UpdateLeadDto, { convertedToCustomerId: 'c-2' })).toEqual([
      'property convertedToCustomerId should not exist',
    ]);
  });

  it('allows partial updates and null to clear an optional field', async () => {
    expect(await pipeErrors(UpdateLeadDto, { notes: 'later' })).toEqual([]);
    expect(await pipeErrors(UpdateLeadDto, { email: null })).toEqual([]);
  });

  it('validates the convert body with a decimal-string amount', async () => {
    expect(await pipeErrors(ConvertLeadDto, {})).toEqual([]);
    expect(
      await pipeErrors(ConvertLeadDto, {
        createDeal: true,
        dealName: 'First order',
        expectedAmount: '1200.50',
      }),
    ).toEqual([]);
    expect(fields(await pipeErrors(ConvertLeadDto, { expectedAmount: '-1200' }))).toContain(
      'expectedAmount',
    );
    expect(fields(await pipeErrors(ConvertLeadDto, { createDeal: 'yes' }))).toContain('createDeal');
    expect(await pipeErrors(ConvertLeadDto, { dealValue: 5 })).toEqual([
      'property dealValue should not exist',
    ]);
  });

  it('validates the assign and bulk-assign bodies', async () => {
    expect(await pipeErrors(AssignCrmRecordDto, { assignedToId: 'user-1' })).toEqual([]);
    expect(fields(await pipeErrors(AssignCrmRecordDto, {}))).toContain('assignedToId');
    expect(
      await pipeErrors(BulkAssignLeadsDto, { leadIds: ['l1', 'l2'], assignedToId: 'user-1' }),
    ).toEqual([]);
    expect(
      fields(await pipeErrors(BulkAssignLeadsDto, { leadIds: [], assignedToId: 'user-1' })),
    ).toContain('leadIds');
    expect(await pipeErrors(BulkAssignLeadsDto, { leadIds: [1], assignedToId: 'user-1' })).toEqual([
      'each value in leadIds must be a string',
    ]);
  });

  it('transforms lead list queries and the cursor filters the leads table sends', async () => {
    expect(
      await pipeTransform(LeadQueryDto, { limit: '200', status: 'QUALIFIED' }, 'query'),
    ).toMatchObject({ limit: 200, status: 'QUALIFIED' });
    expect(fields(await pipeErrors(LeadQueryDto, { offset: '-1' }, 'query'))).toContain('offset');
    expect(
      await pipeTransform(
        LeadCursorQueryDto,
        { status: 'NEW', source: 'WEBSITE', page: '1', search: 'sa' },
        'query',
      ),
    ).toMatchObject({ status: 'NEW', source: 'WEBSITE', page: 1, search: 'sa' });
    expect(fields(await pipeErrors(LeadCursorQueryDto, { source: 'TV' }, 'query'))).toContain(
      'source',
    );
  });
});

describe('Activity DTOs (through the app ValidationPipe)', () => {
  it('accepts an activity and a quick log', async () => {
    expect(
      await pipeErrors(CreateActivityDto, {
        type: 'CALL',
        description: 'Intro call',
        leadId: 'lead-1',
        date: '2026-10-31T10:00:00.000Z',
      }),
    ).toEqual([]);
    expect(
      await pipeErrors(LogActivityDto, { dealId: 'deal-1', description: 'Sent offer' }),
    ).toEqual([]);
  });

  it('rejects an unknown type, an empty description and a bad date', async () => {
    expect(
      fields(await pipeErrors(CreateActivityDto, { type: 'FAX', description: 'x', leadId: 'l' })),
    ).toContain('type');
    expect(fields(await pipeErrors(LogActivityDto, { description: '', leadId: 'l' }))).toContain(
      'description',
    );
    expect(
      fields(await pipeErrors(LogActivityDto, { description: 'x', leadId: 'l', date: 'today' })),
    ).toContain('date');
    expect(await pipeErrors(LogActivityDto, { description: 'x', userId: 'u-2' })).toEqual([
      'property userId should not exist',
    ]);
  });

  it('transforms activity queries', async () => {
    expect(
      await pipeTransform(ActivityQueryDto, { dealId: 'd1', limit: '10' }, 'query'),
    ).toMatchObject({ dealId: 'd1', limit: 10 });
    expect(await pipeTransform(CrmLimitQueryDto, { limit: '50' }, 'query')).toEqual({ limit: 50 });
    expect(fields(await pipeErrors(CrmLimitQueryDto, { limit: 'abc' }, 'query'))).toContain(
      'limit',
    );
  });
});

import { pipeErrors, pipeTransform } from '../../../test/helpers/validation-pipe';
import {
  CreateDealDto,
  DealQueryDto,
  MarkDealLostDto,
  MarkDealWonDto,
  UpdateDealDto,
  UpdateDealStageDto,
} from './deal.dto';

const fields = (messages: string[]): string[] => messages.map((m) => m.split(' ')[0]);

describe('Deal DTOs (through the app ValidationPipe)', () => {
  const valid = { dealName: 'Big deal', expectedAmount: '5000.00', stage: 'NEW' };

  it('accepts a complete deal', async () => {
    expect(
      await pipeErrors(CreateDealDto, {
        ...valid,
        probability: 40,
        expectedCloseDate: '2026-12-31',
        leadId: 'lead-1',
        customerId: 'cust-1',
        assignedToId: 'user-1',
        notes: 'warm',
      }),
    ).toEqual([]);
  });

  it('rejects a deal without an amount (was accepted and stored as 0)', async () => {
    expect(fields(await pipeErrors(CreateDealDto, { dealName: 'no amount' }))).toContain(
      'expectedAmount',
    );
  });

  // The global pipe converts a JSON number to its decimal string before the pattern runs, so
  // `5000` is accepted as "5000"; what the pattern refuses is negative, over-precise or
  // exponent forms.
  it('rejects negative, over-precise, exponent or blank amounts', async () => {
    expect(await pipeTransform(CreateDealDto, { ...valid, expectedAmount: 5000 })).toMatchObject({
      expectedAmount: '5000',
    });
    for (const expectedAmount of ['-1', -1, '1.23456', 1.23456, '1e5', 1e21, '']) {
      expect(fields(await pipeErrors(CreateDealDto, { ...valid, expectedAmount }))).toContain(
        'expectedAmount',
      );
    }
  });

  it('rejects a missing name, an unknown stage, a fractional probability and a bad date', async () => {
    expect(fields(await pipeErrors(CreateDealDto, { expectedAmount: '1' }))).toContain('dealName');
    expect(fields(await pipeErrors(CreateDealDto, { ...valid, stage: 'LIMBO' }))).toContain(
      'stage',
    );
    expect(fields(await pipeErrors(CreateDealDto, { ...valid, probability: 50.5 }))).toContain(
      'probability',
    );
    expect(fields(await pipeErrors(CreateDealDto, { ...valid, probability: 101 }))).toContain(
      'probability',
    );
    expect(
      fields(await pipeErrors(CreateDealDto, { ...valid, expectedCloseDate: 'soon' })),
    ).toContain('expectedCloseDate');
  });

  it('rejects unknown and tenant fields', async () => {
    expect(await pipeErrors(CreateDealDto, { ...valid, organizationId: 'org-2' })).toEqual([
      'property organizationId should not exist',
    ]);
    expect(await pipeErrors(UpdateDealDto, { id: 'x' })).toEqual(['property id should not exist']);
  });

  it('allows partial updates but still validates the fields that are sent', async () => {
    expect(await pipeErrors(UpdateDealDto, { notes: 'call back' })).toEqual([]);
    expect(await pipeErrors(UpdateDealDto, { lostReason: 'price' })).toEqual([]);
    expect(fields(await pipeErrors(UpdateDealDto, { stage: 'LIMBO' }))).toContain('stage');
    expect(fields(await pipeErrors(UpdateDealDto, { expectedAmount: '12.00001' }))).toContain(
      'expectedAmount',
    );
  });

  it('validates the stage-move, won and lost bodies', async () => {
    expect(await pipeErrors(UpdateDealStageDto, { stage: 'PROPOSAL_SENT' })).toEqual([]);
    expect(await pipeErrors(UpdateDealStageDto, { stage: 'LIMBO' })).not.toEqual([]);
    expect(await pipeErrors(UpdateDealStageDto, {})).not.toEqual([]);
    expect(await pipeErrors(MarkDealWonDto, {})).toEqual([]);
    expect(await pipeErrors(MarkDealWonDto, { createQuote: true })).toEqual([]);
    // Implicit conversion would have turned the string into `true`.
    expect(fields(await pipeErrors(MarkDealWonDto, { createQuote: 'false' }))).toContain(
      'createQuote',
    );
    expect(await pipeErrors(MarkDealLostDto, { reason: 'price' })).toEqual([]);
    expect(fields(await pipeErrors(MarkDealLostDto, { reason: 'x'.repeat(501) }))).toContain(
      'reason',
    );
  });

  it('transforms list paging and rejects bad filters', async () => {
    const query = await pipeTransform(
      DealQueryDto,
      { limit: '200', page: '2', stage: 'WON' },
      'query',
    );
    expect(query).toMatchObject({ limit: 200, page: 2, stage: 'WON' });
    expect(fields(await pipeErrors(DealQueryDto, { limit: 'abc' }, 'query'))).toContain('limit');
    expect(fields(await pipeErrors(DealQueryDto, { stage: 'LIMBO' }, 'query'))).toContain('stage');
    expect(await pipeErrors(DealQueryDto, { foo: '1' }, 'query')).toEqual([
      'property foo should not exist',
    ]);
  });
});

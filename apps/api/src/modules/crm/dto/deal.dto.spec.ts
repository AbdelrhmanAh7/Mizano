import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDealDto, UpdateDealDto, UpdateDealStageDto } from './deal.dto';

// Same options as the global pipe in main.ts
const check = async <T extends object>(cls: new () => T, body: Record<string, unknown>) =>
  validate(plainToInstance(cls, body, { enableImplicitConversion: true }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('Deal DTOs', () => {
  const valid = { dealName: 'Big deal', expectedAmount: 5000, stage: 'NEW' };

  it('accepts a complete deal', async () => {
    expect(await check(CreateDealDto, valid)).toEqual([]);
  });

  it('rejects a deal without an amount (was accepted and stored as 0)', async () => {
    const errors = await check(CreateDealDto, { dealName: 'no amount' });
    expect(errors.map((e) => e.property)).toContain('expectedAmount');
  });

  it('rejects a deal without a name, a negative amount and an unknown stage', async () => {
    expect((await check(CreateDealDto, { expectedAmount: 1 })).map((e) => e.property)).toContain('dealName');
    expect((await check(CreateDealDto, { ...valid, expectedAmount: -1 })).map((e) => e.property)).toContain(
      'expectedAmount',
    );
    expect((await check(CreateDealDto, { ...valid, stage: 'LIMBO' })).map((e) => e.property)).toContain('stage');
  });

  it('rejects unknown fields', async () => {
    expect(await check(CreateDealDto, { ...valid, hacker: true })).not.toEqual([]);
  });

  it('allows partial updates but still validates the fields that are sent', async () => {
    expect(await check(UpdateDealDto, { notes: 'call back' })).toEqual([]);
    expect(await check(UpdateDealDto, { lostReason: 'price' })).toEqual([]);
    expect((await check(UpdateDealDto, { stage: 'LIMBO' })).map((e) => e.property)).toContain('stage');
  });

  it('validates the stage-move body', async () => {
    expect(await check(UpdateDealStageDto, { stage: 'PROPOSAL_SENT' })).toEqual([]);
    expect(await check(UpdateDealStageDto, { stage: 'LIMBO' })).not.toEqual([]);
    expect(await check(UpdateDealStageDto, {})).not.toEqual([]);
  });
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsStrictBoolean } from './strict-boolean';
import { UpdateTourProgressDto } from '../../modules/user-preferences/dto/update-tour-progress.dto';
import { UpdateDashboardLayoutDto } from '../../modules/user-preferences/dto/update-dashboard-layout.dto';

// Same options as the global pipe in main.ts
const check = async <T extends object>(cls: new () => T, body: Record<string, unknown>) =>
  validate(plainToInstance(cls, body, { enableImplicitConversion: true }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

class Probe {
  @IsStrictBoolean()
  flag!: boolean;
}

describe('IsStrictBoolean', () => {
  it.each([true, false])('accepts %s', async (flag) => {
    expect(await check(Probe, { flag })).toEqual([]);
  });

  it.each(['maybe', 'false', 'true', 'yes', 1, 0, null])('rejects %p', async (flag) => {
    expect((await check(Probe, { flag })).map((e) => e.property)).toEqual(['flag']);
  });

  it('rejects a missing value', async () => {
    expect((await check(Probe, {})).map((e) => e.property)).toEqual(['flag']);
  });
});

describe('user preferences DTOs reject non-boolean flags', () => {
  it('tour progress: completed must be a boolean', async () => {
    expect(await check(UpdateTourProgressDto, { completed: false, currentStep: 2 })).toEqual([]);
    expect(
      (await check(UpdateTourProgressDto, { completed: 'maybe' })).map((e) => e.property),
    ).toEqual(['completed']);
    // "false" used to be coerced to true and stored as a finished tour
    expect(
      (await check(UpdateTourProgressDto, { completed: 'false' })).map((e) => e.property),
    ).toEqual(['completed']);
  });

  it('dashboard layout: widget.visible must be a boolean', async () => {
    const widgets = (visible: unknown) => ({ widgets: [{ id: 'x', visible, order: 0 }] });
    expect(await check(UpdateDashboardLayoutDto, widgets(false))).toEqual([]);
    expect(await check(UpdateDashboardLayoutDto, widgets('yes'))).not.toEqual([]);
    expect(await check(UpdateDashboardLayoutDto, widgets('false'))).not.toEqual([]);
  });
});

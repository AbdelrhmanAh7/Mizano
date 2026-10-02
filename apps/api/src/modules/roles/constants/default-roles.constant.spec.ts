import { AVAILABLE_ACTIONS, DEFAULT_ROLES } from './default-roles.constant';

describe('default roles', () => {
  it('registers the tax submit action and grants it to Admin and Accountant only', () => {
    expect(AVAILABLE_ACTIONS).toContain('submit');
    const taxActions = (name: string): readonly string[] =>
      DEFAULT_ROLES.find((r) => r.name === name)?.permissions.find((p) => p.module === 'tax')
        ?.actions ?? [];
    expect(taxActions('Admin')).toContain('submit');
    expect(taxActions('Accountant')).toContain('submit');
    expect(taxActions('Manager')).not.toContain('submit');
  });
});

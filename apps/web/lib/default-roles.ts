/** The standard roles every organization starts with (the server creates them at sign-up). */
const DEFAULT_ROLE_NAMES = ['Admin', 'Manager', 'Accountant', 'SalesRep', 'StoreKeeper'];

/**
 * True when one of the standard roles is missing (for example an organization created before
 * every role was added at sign-up), so the page offers to add them. A role a person renamed
 * has no English system name and counts as missing: adding the standard one is harmless.
 */
export function isMissingDefaultRoles(
  roles: Array<{ name: string; nameEn?: string | null }>,
): boolean {
  const have = new Set(roles.map((r) => r.nameEn ?? r.name));
  return DEFAULT_ROLE_NAMES.some((name) => !have.has(name));
}

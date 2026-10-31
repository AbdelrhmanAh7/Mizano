import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const ANY_PERMISSION_KEY = 'anyPermission';

/** The role must hold every one of these permissions. */
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * The role must hold at least one of these permissions, for a route that serves several forms
 * (for example create and edit). Combines with @Permissions, which stays all-of.
 */
export const AnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSION_KEY, permissions);

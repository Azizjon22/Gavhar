import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../permissions/permission-catalog';

export const PERMISSIONS_KEY = 'auth:permissions';

/** Sanab o'tilgan BARCHA ruxsatlar talab qilinadi. SUPER_ADMIN har doim o'tadi. */
export const Permissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

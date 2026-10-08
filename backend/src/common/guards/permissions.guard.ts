import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '@/common/decorators/permissions.decorator';
import { SUPER_ADMIN_ONLY_KEY } from '@/common/decorators/super-admin-only.decorator';
import { AppException } from '@/common/errors/app.exception';
import { PermissionKey, SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthenticatedRequest } from '@/common/types/auth-user';

const forbidden = (missing?: string[]) =>
  AppException.forbidden(
    'FORBIDDEN',
    "Bu amal uchun ruxsatingiz yo'q",
    missing && { missingPermissions: missing },
  );

/** Global guard: `@Permissions()` va `@SuperAdminOnly()` talablarini tekshiradi. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const superAdminOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_ONLY_KEY, targets);
    const required =
      this.reflector.getAllAndOverride<PermissionKey[] | undefined>(PERMISSIONS_KEY, targets) ?? [];
    if (!superAdminOnly && required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user.roleKey === SYSTEM_ROLES.SUPER_ADMIN) return true;
    if (superAdminOnly) throw forbidden();

    const granted = new Set(user.permissions);
    const missing = required.filter((permission) => !granted.has(permission));
    if (missing.length > 0) throw forbidden(missing);
    return true;
  }
}

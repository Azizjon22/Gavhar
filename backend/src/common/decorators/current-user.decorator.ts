import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthUser, AuthenticatedRequest } from '../types/auth-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

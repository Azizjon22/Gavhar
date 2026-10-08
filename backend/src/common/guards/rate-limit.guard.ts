import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RATE_LIMIT_KEY, RateLimitOptions } from '@/common/decorators/rate-limit.decorator';
import { AppException } from '@/common/errors/app.exception';
import { RateLimitService } from '@/infrastructure/redis/rate-limit.service';

/** `@RateLimit()` bilan belgilangan endpointlar uchun IP bo'yicha cheklov. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const http = context.switchToHttp();
    const ip = http.getRequest<Request>().ip ?? 'unknown';
    const result = await this.rateLimit.consume(
      `rate-limit:${options.name}:${ip}`,
      options.limit,
      options.windowSeconds,
    );

    if (!result.allowed) {
      http.getResponse<Response>().setHeader('Retry-After', String(result.retryAfterSeconds));
      throw AppException.tooManyRequests(
        'RATE_LIMITED',
        "Juda ko'p so'rov. Birozdan keyin urinib ko'ring",
        result.retryAfterSeconds,
      );
    }
    return true;
  }
}

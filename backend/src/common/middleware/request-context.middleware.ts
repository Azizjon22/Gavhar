import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { requestContext } from '../context/request-context';
import { normalizeIp } from '../utils/ip.util';

const MAX_USER_AGENT_LENGTH = 512;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { id?: string | number }, res: Response, next: NextFunction): void {
    const headerId = res.getHeader('x-request-id');
    const requestId = req.id ?? (typeof headerId === 'string' ? headerId : undefined);

    requestContext.run(
      {
        requestId: requestId !== undefined ? String(requestId) : undefined,
        ip: normalizeIp(req.ip),
        userAgent: req.headers['user-agent']?.slice(0, MAX_USER_AGENT_LENGTH),
      },
      next,
    );
  }
}

import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export interface GatewayOptions {
  authToken?: string;
  logger?: (message: string, metadata: Record<string, unknown>) => void;
  rateLimit?: {
    enabled: boolean;
    maxRequests: number;
  };
}

const requestCounts = new Map<string, number>();

function getClientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function createGatewayMiddleware(options: GatewayOptions = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestIdHeader = req.header('x-request-id');
    const requestId = requestIdHeader && requestIdHeader.trim().length > 0
      ? requestIdHeader
      : randomUUID();

    res.setHeader('x-request-id', requestId);

    if (options.authToken !== undefined) {
      const expected = `Bearer ${options.authToken}`;
      if (req.header('authorization') !== expected) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    if (options.rateLimit?.enabled === true) {
      const clientKey = getClientKey(req);
      const nextCount = (requestCounts.get(clientKey) ?? 0) + 1;
      requestCounts.set(clientKey, nextCount);

      if (nextCount > options.rateLimit.maxRequests) {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
    }

    options.logger?.('request.received', {
      method: req.method,
      path: req.path,
      requestId,
    });

    next();
  };
}

export function resetGatewayRateLimits(): void {
  requestCounts.clear();
}

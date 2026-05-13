import type { Response } from 'express';

import { InsufficientResourcesError, ValidationError } from '../domain/errors';
import { ConcurrencyError, DuplicateIdError, NotFoundError } from '../persistence/types';

export function sendError(error: unknown, res: Response): void {
  const requestIdHeader = res.getHeader('x-request-id');
  const requestId = typeof requestIdHeader === 'string' ? requestIdHeader : undefined;

  if (error instanceof NotFoundError) {
    res.status(404).json(formatError('NOT_FOUND', error.message, requestId));
    return;
  }
  if (error instanceof ValidationError || error instanceof InsufficientResourcesError) {
    res.status(400).json(formatError('VALIDATION_ERROR', error.message, requestId));
    return;
  }
  if (error instanceof DuplicateIdError || error instanceof ConcurrencyError) {
    res.status(409).json(formatError('CONFLICT', error.message, requestId));
    return;
  }
  res.status(500).json(formatError('INTERNAL_ERROR', 'Internal server error', requestId));
}

function formatError(code: string, message: string, requestId?: string) {
  return {
    error: message,
    code,
    requestId,
  };
}

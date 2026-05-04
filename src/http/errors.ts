import type { Response } from 'express';

import { InsufficientResourcesError, ValidationError } from '../domain/errors';
import { ConcurrencyError, DuplicateIdError, NotFoundError } from '../persistence/types';

export function sendError(error: unknown, res: Response): void {
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof ValidationError || error instanceof InsufficientResourcesError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof DuplicateIdError || error instanceof ConcurrencyError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
}

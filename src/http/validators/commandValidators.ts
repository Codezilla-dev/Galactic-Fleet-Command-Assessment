import { ValidationError } from '../../domain/errors';

export function parseCommandPayload(body: unknown): {
  type: 'PrepareFleetCommand';
  payload: { fleetId: string };
} {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Body must be an object');
  }

  const candidate = body as Record<string, unknown>;
  if (candidate.type !== 'PrepareFleetCommand') {
    throw new ValidationError('Only PrepareFleetCommand is supported');
  }

  if (typeof candidate.payload !== 'object' || candidate.payload === null) {
    throw new ValidationError('payload is required');
  }

  const payload = candidate.payload as Record<string, unknown>;
  if (typeof payload.fleetId !== 'string') {
    throw new ValidationError('payload.fleetId is required');
  }

  return {
    type: 'PrepareFleetCommand',
    payload: { fleetId: payload.fleetId },
  };
}

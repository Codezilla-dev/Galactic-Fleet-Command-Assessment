import { ValidationError } from '../../domain/errors';
import type { CommandType } from '../../persistence';

export function parseCommandPayload(body: unknown): {
  type: CommandType;
  payload: { fleetId: string };
} {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Body must be an object');
  }

  const candidate = body as Record<string, unknown>;
  if (candidate.type !== 'PrepareFleetCommand' && candidate.type !== 'DeployFleetCommand') {
    throw new ValidationError('Only PrepareFleetCommand and DeployFleetCommand are supported');
  }

  if (typeof candidate.payload !== 'object' || candidate.payload === null) {
    throw new ValidationError('payload is required');
  }

  const payload = candidate.payload as Record<string, unknown>;
  if (typeof payload.fleetId !== 'string') {
    throw new ValidationError('payload.fleetId is required');
  }

  return {
    type: candidate.type,
    payload: { fleetId: payload.fleetId },
  };
}

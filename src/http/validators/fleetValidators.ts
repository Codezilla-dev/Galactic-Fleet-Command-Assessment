import { ValidationError } from '../../domain/errors';

export interface CreateFleetPayload {
  id?: string;
  name: string;
  shipCount: number;
  fuelRequired: number;
}

export interface UpdateFleetPayload {
  name?: string;
  shipCount?: number;
  fuelRequired?: number;
}

export function parseFleetPayload(body: unknown): CreateFleetPayload {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Body must be an object');
  }

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.name !== 'string') {
    throw new ValidationError('name is required');
  }
  if (typeof candidate.shipCount !== 'number') {
    throw new ValidationError('shipCount is required');
  }
  if (typeof candidate.fuelRequired !== 'number') {
    throw new ValidationError('fuelRequired is required');
  }

  const payload: CreateFleetPayload = {
    name: candidate.name,
    shipCount: candidate.shipCount,
    fuelRequired: candidate.fuelRequired,
  };

  if (typeof candidate.id === 'string') {
    payload.id = candidate.id;
  }
  return payload;
}

export function parseFleetPatch(body: unknown): UpdateFleetPayload {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Body must be an object');
  }

  const candidate = body as Record<string, unknown>;
  const patch: UpdateFleetPayload = {};

  if ('name' in candidate) {
    if (typeof candidate.name !== 'string') {
      throw new ValidationError('name must be a string');
    }
    patch.name = candidate.name;
  }
  if ('shipCount' in candidate) {
    if (typeof candidate.shipCount !== 'number') {
      throw new ValidationError('shipCount must be a number');
    }
    patch.shipCount = candidate.shipCount;
  }
  if ('fuelRequired' in candidate) {
    if (typeof candidate.fuelRequired !== 'number') {
      throw new ValidationError('fuelRequired must be a number');
    }
    patch.fuelRequired = candidate.fuelRequired;
  }

  if (Object.keys(patch).length === 0) {
    throw new ValidationError('At least one updatable property is required');
  }

  return patch;
}

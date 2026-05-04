import { InMemoryRepository, type Repository } from './InMemoryRepository';
import type { VersionedEntity } from './types';

/**
 * Command lifecycle (see assignment).
 */
export type CommandStatus = 'Queued' | 'Processing' | 'Succeeded' | 'Failed';
export type CommandType = 'PrepareFleetCommand' | 'DeployFleetCommand';

export interface PrepareFleetCommandPayload {
  fleetId: string;
}

export interface DeployFleetCommandPayload {
  fleetId: string;
}

/**
 * Minimal command entity for persistence.
 * Candidates can extend with attemptCount, timestamps, error, idempotency key, etc.
 */
export interface Command extends VersionedEntity {
  type: CommandType;
  status: CommandStatus;
  payload: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string;
}

export type CommandRepository = Repository<Command>;

export function createInMemoryCommandRepository(): CommandRepository {
  return new InMemoryRepository<Command>();
}

import { InMemoryRepository, type Repository } from './InMemoryRepository';
import type { VersionedEntity } from './types';

/**
 * Fleet lifecycle states (see assignment domain model).
 * Candidates will enforce valid transitions.
 */
export type FleetState =
  | 'Docked'
  | 'Preparing'
  | 'Ready'
  | 'Deployed'
  | 'FailedPreparation';

/**
 * Minimal fleet entity for persistence.
 * Candidates can extend with ships, loadout, reserved resources, etc.
 */
export interface Fleet extends VersionedEntity {
  name: string;
  shipCount?: number;
  fuelRequired?: number;
  state: FleetState;
}

export type FleetRepository = Repository<Fleet>;

export function createInMemoryFleetRepository(): FleetRepository {
  return new InMemoryRepository<Fleet>();
}

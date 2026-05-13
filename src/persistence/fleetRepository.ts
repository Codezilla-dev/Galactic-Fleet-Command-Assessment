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

export interface FleetTransitionHistoryEntry {
  from: FleetState | null;
  to: FleetState;
  at: string;
  reason: string;
}

/**
 * Minimal fleet entity for persistence.
 * Candidates can extend with ships, loadout, reserved resources, etc.
 */
export interface Fleet extends VersionedEntity {
  name: string;
  shipCount: number;
  fuelRequired: number;
  state: FleetState;
  history: FleetTransitionHistoryEntry[];
}

export type FleetRepository = Repository<Fleet>;

export function createInMemoryFleetRepository(): FleetRepository {
  return new InMemoryRepository<Fleet>();
}

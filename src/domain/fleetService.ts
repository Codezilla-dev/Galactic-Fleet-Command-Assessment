import { randomUUID } from 'node:crypto';

import type { Fleet, FleetRepository, FleetState } from '../persistence';

import { ValidationError } from './errors';

export interface CreateFleetInput {
  id?: string;
  name: string;
  shipCount: number;
  fuelRequired: number;
}

export interface UpdateFleetInput {
  name?: string;
  shipCount?: number;
  fuelRequired?: number;
}

const ALLOWED_TRANSITIONS: Record<FleetState, FleetState[]> = {
  Docked: ['Preparing'],
  Preparing: ['Ready', 'FailedPreparation'],
  Ready: ['Deployed'],
  Deployed: [],
  FailedPreparation: [],
};

export class FleetService {
  constructor(private readonly fleets: FleetRepository) {}

  createFleet(input: CreateFleetInput): Fleet {
    this.validateFleetInput(input.name, input.shipCount, input.fuelRequired);
    const fleet: Fleet = {
      id: input.id ?? randomUUID(),
      version: 1,
      name: input.name.trim(),
      shipCount: input.shipCount,
      fuelRequired: input.fuelRequired,
      state: 'Docked',
    };
    this.fleets.create(fleet);
    return fleet;
  }

  getFleet(id: string): Fleet | undefined {
    return this.fleets.get(id);
  }

  getFleetOrThrow(id: string): Fleet {
    return this.fleets.getOrThrow(id);
  }

  updateFleet(id: string, patch: UpdateFleetInput): Fleet {
    const current = this.fleets.getOrThrow(id);
    const updatedName = patch.name ?? current.name;
    const updatedShipCount = patch.shipCount ?? current.shipCount;
    const updatedFuelRequired = patch.fuelRequired ?? current.fuelRequired;
    this.validateFleetInput(updatedName, updatedShipCount, updatedFuelRequired);

    this.fleets.update(id, current.version, (fleet) => ({
      ...fleet,
      name: updatedName.trim(),
      shipCount: updatedShipCount,
      fuelRequired: updatedFuelRequired,
    }));

    return this.fleets.getOrThrow(id);
  }

  transition(id: string, targetState: FleetState): Fleet {
    const current = this.fleets.getOrThrow(id);
    const allowed = ALLOWED_TRANSITIONS[current.state];
    if (!allowed.includes(targetState)) {
      throw new ValidationError(
        `Invalid fleet transition: ${current.state} -> ${targetState}`,
      );
    }

    this.fleets.update(id, current.version, (fleet) => ({
      ...fleet,
      state: targetState,
    }));
    return this.fleets.getOrThrow(id);
  }

  private validateFleetInput(name: string, shipCount: number, fuelRequired: number): void {
    if (name.trim().length === 0) {
      throw new ValidationError('Fleet name is required');
    }
    if (!Number.isInteger(shipCount) || shipCount <= 0) {
      throw new ValidationError('shipCount must be a positive integer');
    }
    if (!Number.isFinite(fuelRequired) || fuelRequired <= 0) {
      throw new ValidationError('fuelRequired must be a positive number');
    }
  }
}

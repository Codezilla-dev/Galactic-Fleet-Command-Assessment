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

function nowIso(): string {
  return new Date().toISOString();
}

export class FleetService {
  constructor(private readonly fleets: FleetRepository) {}

  createFleet(input: CreateFleetInput): Fleet {
    this.validateFleetInput(input.name, input.shipCount, input.fuelRequired);
    const createdAt = nowIso();
    const fleet: Fleet = {
      id: input.id ?? randomUUID(),
      version: 1,
      name: input.name.trim(),
      shipCount: input.shipCount,
      fuelRequired: input.fuelRequired,
      state: 'Docked',
      history: [
        {
          from: null,
          to: 'Docked',
          at: createdAt,
          reason: 'fleet-created',
        },
      ],
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

  async prepareFleet(
    id: string,
    reserveResources: (fleet: Fleet) => Promise<void>,
  ): Promise<Fleet> {
    const preparing = this.transition(id, 'Preparing', 'preparation-started');

    try {
      await reserveResources(preparing);
      return this.transition(id, 'Ready', 'resources-reserved');
    } catch (error) {
      const current = this.fleets.get(id);
      if (current?.state === 'Preparing') {
        this.transition(id, 'FailedPreparation', 'resource-reservation-failed');
      }
      throw error;
    }
  }

  deployFleet(id: string): Fleet {
    return this.transition(id, 'Deployed', 'fleet-deployed');
  }

  private transition(id: string, targetState: FleetState, reason: string): Fleet {
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
      history: [
        ...fleet.history,
        {
          from: current.state,
          to: targetState,
          at: nowIso(),
          reason,
        },
      ],
    }));
    return this.fleets.getOrThrow(id);
  }

  private validateFleetInput(name: string, shipCount: unknown, fuelRequired: unknown): void {
    if (name.trim().length === 0) {
      throw new ValidationError('Fleet name is required');
    }
    if (typeof shipCount !== 'number' || !Number.isInteger(shipCount) || shipCount <= 0) {
      throw new ValidationError('shipCount must be a positive integer');
    }
    if (
      typeof fuelRequired !== 'number' ||
      !Number.isFinite(fuelRequired) ||
      fuelRequired <= 0
    ) {
      throw new ValidationError('fuelRequired must be a positive number');
    }
  }
}

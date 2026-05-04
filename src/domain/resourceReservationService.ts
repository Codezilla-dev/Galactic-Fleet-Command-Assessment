import { ConcurrencyError, type ResourcePoolRepository } from '../persistence';

import { InsufficientResourcesError } from './errors';

export class ResourceReservationService {
  constructor(
    private readonly resourcePools: ResourcePoolRepository,
    private readonly maxConcurrencyRetries = 5,
  ) {}

  seedFuelPool(totalFuel: number): void {
    const existing = this.resourcePools.getByType('FUEL');
    if (existing !== undefined) {
      return;
    }

    this.resourcePools.create({
      id: 'pool-fuel',
      version: 1,
      resourceType: 'FUEL',
      total: totalFuel,
      reserved: 0,
    });
  }

  async reserveFuel(amount: number): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new InsufficientResourcesError('fuel reservation amount must be positive');
    }

    for (let attempt = 0; attempt <= this.maxConcurrencyRetries; attempt += 1) {
      const pool = this.resourcePools.getByType('FUEL');
      if (pool === undefined) {
        throw new InsufficientResourcesError('Fuel pool is not configured');
      }

      if (pool.total - pool.reserved < amount) {
        throw new InsufficientResourcesError('Not enough available fuel');
      }

      await Promise.resolve();

      try {
        this.resourcePools.update(pool.id, pool.version, (current) => {
          if (current.total - current.reserved < amount) {
            throw new InsufficientResourcesError('Not enough available fuel');
          }
          return { ...current, reserved: current.reserved + amount };
        });
        return;
      } catch (error) {
        if (error instanceof ConcurrencyError) {
          continue;
        }
        throw error;
      }
    }

    throw new InsufficientResourcesError('Unable to reserve fuel due to heavy contention');
  }
}

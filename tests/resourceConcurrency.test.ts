import { ResourceReservationService } from '../src/domain/resourceReservationService';
import { createPersistenceContext } from '../src/persistence/context';

describe('Resource reservation concurrency', () => {
  it('never over-allocates fuel under concurrent reservations', async () => {
    const ctx = createPersistenceContext();
    const reservationService = new ResourceReservationService(ctx.resourcePools);
    reservationService.seedFuelPool(100);

    const results = await Promise.allSettled([
      reservationService.reserveFuel(60),
      reservationService.reserveFuel(60),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const pool = ctx.resourcePools.getByType('FUEL');
    expect(pool).toBeDefined();
    expect(pool?.reserved).toBe(60);
    expect(succeeded.length).toBe(1);
    expect((pool?.total ?? 0) - (pool?.reserved ?? 0)).toBeGreaterThanOrEqual(0);
  });
});

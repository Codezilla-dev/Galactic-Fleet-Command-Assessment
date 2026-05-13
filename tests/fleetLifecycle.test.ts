import { ValidationError } from '../src/domain/errors';
import { FleetService } from '../src/domain/fleetService';
import { createPersistenceContext } from '../src/persistence/context';

describe('Fleet lifecycle transitions', () => {
  it('allows Docked -> Preparing -> Ready -> Deployed through domain operations', async () => {
    const ctx = createPersistenceContext();
    const fleetService = new FleetService(ctx.fleets);
    const fleet = fleetService.createFleet({
      name: 'Orion Vanguard',
      shipCount: 12,
      fuelRequired: 200,
    });

    const ready = await fleetService.prepareFleet(fleet.id, async () => {
      await Promise.resolve();
    });
    const deployed = fleetService.deployFleet(fleet.id);

    expect(ready.state).toBe('Ready');
    expect(deployed.state).toBe('Deployed');
    expect(deployed.history.map((entry) => entry.to)).toEqual([
      'Docked',
      'Preparing',
      'Ready',
      'Deployed',
    ]);
  });

  it('rejects deploy from Docked', () => {
    const ctx = createPersistenceContext();
    const fleetService = new FleetService(ctx.fleets);
    const fleet = fleetService.createFleet({
      name: 'Orion Vanguard',
      shipCount: 12,
      fuelRequired: 200,
    });

    expect(() => fleetService.deployFleet(fleet.id)).toThrow(ValidationError);
  });

  it('moves to FailedPreparation when reservation fails', async () => {
    const ctx = createPersistenceContext();
    const fleetService = new FleetService(ctx.fleets);
    const fleet = fleetService.createFleet({
      name: 'Orion Vanguard',
      shipCount: 12,
      fuelRequired: 200,
    });

    await expect(
      fleetService.prepareFleet(fleet.id, async () => {
        throw new Error('reservation failed');
      }),
    ).rejects.toThrow('reservation failed');

    const failed = fleetService.getFleetOrThrow(fleet.id);
    expect(failed.state).toBe('FailedPreparation');
    expect(failed.history.map((entry) => entry.to)).toEqual([
      'Docked',
      'Preparing',
      'FailedPreparation',
    ]);
  });
});

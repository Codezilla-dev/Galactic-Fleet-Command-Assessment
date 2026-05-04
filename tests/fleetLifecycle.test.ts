import { ValidationError } from '../src/domain/errors';
import { FleetService } from '../src/domain/fleetService';
import { createPersistenceContext } from '../src/persistence/context';

describe('Fleet lifecycle transitions', () => {
  it('allows Docked -> Preparing -> Ready -> Deployed', () => {
    const ctx = createPersistenceContext();
    const fleetService = new FleetService(ctx.fleets);
    const fleet = fleetService.createFleet({
      name: 'Orion Vanguard',
      shipCount: 12,
      fuelRequired: 200,
    });

    const preparing = fleetService.transition(fleet.id, 'Preparing');
    const ready = fleetService.transition(fleet.id, 'Ready');
    const deployed = fleetService.transition(fleet.id, 'Deployed');

    expect(preparing.state).toBe('Preparing');
    expect(ready.state).toBe('Ready');
    expect(deployed.state).toBe('Deployed');
  });

  it('rejects invalid transition directly from Docked -> Ready', () => {
    const ctx = createPersistenceContext();
    const fleetService = new FleetService(ctx.fleets);
    const fleet = fleetService.createFleet({
      name: 'Orion Vanguard',
      shipCount: 12,
      fuelRequired: 200,
    });

    expect(() => fleetService.transition(fleet.id, 'Ready')).toThrow(ValidationError);
  });
});

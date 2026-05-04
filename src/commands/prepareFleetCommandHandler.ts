import { InsufficientResourcesError } from '../domain/errors';
import { FleetService } from '../domain/fleetService';
import { ResourceReservationService } from '../domain/resourceReservationService';

export class PrepareFleetCommandHandler {
  constructor(
    private readonly fleetService: FleetService,
    private readonly resourceReservationService: ResourceReservationService,
  ) {}

  async execute(fleetId: string): Promise<void> {
    this.fleetService.transition(fleetId, 'Preparing');

    try {
      const fleet = this.fleetService.getFleetOrThrow(fleetId);
      if (fleet.fuelRequired === undefined) {
        throw new InsufficientResourcesError('Fleet fuel requirement is not configured');
      }
      await this.resourceReservationService.reserveFuel(fleet.fuelRequired);
      this.fleetService.transition(fleetId, 'Ready');
    } catch (error) {
      const fleet = this.fleetService.getFleet(fleetId);
      if (fleet?.state === 'Preparing') {
        this.fleetService.transition(fleetId, 'FailedPreparation');
      }

      if (error instanceof InsufficientResourcesError) {
        throw error;
      }

      throw error;
    }
  }
}

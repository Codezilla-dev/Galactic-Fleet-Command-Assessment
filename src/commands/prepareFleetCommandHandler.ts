import { FleetService } from '../domain/fleetService';
import { ResourceReservationService } from '../domain/resourceReservationService';

export class PrepareFleetCommandHandler {
  constructor(
    private readonly fleetService: FleetService,
    private readonly resourceReservationService: ResourceReservationService,
  ) {}

  async execute(fleetId: string): Promise<void> {
    await this.fleetService.prepareFleet(fleetId, async (fleet) => {
      await this.resourceReservationService.reserveFuel(fleet.fuelRequired);
    });
  }
}

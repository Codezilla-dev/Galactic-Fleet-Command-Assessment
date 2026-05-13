import { FleetService } from '../domain/fleetService';

export class DeployFleetCommandHandler {
  constructor(private readonly fleetService: FleetService) {}

  async execute(fleetId: string): Promise<void> {
    this.fleetService.deployFleet(fleetId);
  }
}

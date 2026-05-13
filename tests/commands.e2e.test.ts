import request from 'supertest';

import { createApp } from '../src/app';

async function waitForCommand(
  app: ReturnType<typeof createApp>,
  commandId: string,
): Promise<{ status: string; errorMessage?: string }> {
  for (let i = 0; i < 20; i += 1) {
    const response = await request(app).get(`/commands/${commandId}`);
    if (response.body.status === 'Succeeded' || response.body.status === 'Failed') {
      return response.body as { status: string; errorMessage?: string };
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error(`Command did not finish in time: ${commandId}`);
}

describe('Fleet commands end-to-end', () => {
  it('creates fleet, queues prepare and deploy commands, and transitions to Deployed', async () => {
    const app = createApp({ initialFuelTotal: 500 });

    const fleetResponse = await request(app).post('/fleets').send({
      name: 'Aurora Strike Group',
      shipCount: 8,
      fuelRequired: 120,
    });

    expect(fleetResponse.status).toBe(201);
    const fleetId = fleetResponse.body.id as string;

    const commandResponse = await request(app).post('/commands').send({
      type: 'PrepareFleetCommand',
      payload: { fleetId },
    });
    expect(commandResponse.status).toBe(202);

    const result = await waitForCommand(app, commandResponse.body.id as string);
    expect(result.status).toBe('Succeeded');

    const fleetAfterPrepare = await request(app).get(`/fleets/${fleetId}`);
    expect(fleetAfterPrepare.status).toBe(200);
    expect(fleetAfterPrepare.body.state).toBe('Ready');

    const deployResponse = await request(app).post('/commands').send({
      type: 'DeployFleetCommand',
      payload: { fleetId },
    });
    expect(deployResponse.status).toBe(202);

    const deployResult = await waitForCommand(app, deployResponse.body.id as string);
    expect(deployResult.status).toBe('Succeeded');

    const fleetAfterDeploy = await request(app).get(`/fleets/${fleetId}`);
    expect(fleetAfterDeploy.status).toBe(200);
    expect(fleetAfterDeploy.body.state).toBe('Deployed');
    expect(fleetAfterDeploy.body.history.map((entry: { to: string }) => entry.to)).toEqual([
      'Docked',
      'Preparing',
      'Ready',
      'Deployed',
    ]);
  });

  it('fails DeployFleetCommand when the fleet is not Ready', async () => {
    const app = createApp({ initialFuelTotal: 500 });

    const fleetResponse = await request(app).post('/fleets').send({
      name: 'Docked Fleet',
      shipCount: 4,
      fuelRequired: 80,
    });

    const fleetId = fleetResponse.body.id as string;
    const commandResponse = await request(app).post('/commands').send({
      type: 'DeployFleetCommand',
      payload: { fleetId },
    });
    expect(commandResponse.status).toBe(202);

    const result = await waitForCommand(app, commandResponse.body.id as string);
    expect(result.status).toBe('Failed');
    expect(result.errorMessage).toBe('Invalid fleet transition: Docked -> Deployed');

    const fleetAfter = await request(app).get(`/fleets/${fleetId}`);
    expect(fleetAfter.body.state).toBe('Docked');
  });
});

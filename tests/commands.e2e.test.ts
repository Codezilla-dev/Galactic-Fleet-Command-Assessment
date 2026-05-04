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

describe('Prepare fleet command end-to-end', () => {
  it('creates fleet, queues prepare command, and transitions to Ready', async () => {
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

    const fleetAfter = await request(app).get(`/fleets/${fleetId}`);
    expect(fleetAfter.status).toBe(200);
    expect(fleetAfter.body.state).toBe('Ready');
  });
});

import request from 'supertest';

import { createApp } from '../src/app';

async function waitForCommand(app: ReturnType<typeof createApp>, commandId: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const response = await request(app).get(`/commands/${commandId}`);
    if (response.body.status === 'Succeeded' || response.body.status === 'Failed') {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error(`Command did not finish in time: ${commandId}`);
}

describe('GET /system/status', () => {
  it('reports architecture modes and queue stats', async () => {
    const app = createApp();

    const res = await request(app).get('/system/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      architecture: {
        cache: 'in-memory',
        gateway: 'express-middleware-stub',
        queue: 'in-memory-single-worker',
        storage: 'in-memory-repository',
        webhook: 'noop',
      },
      queue: {
        pendingCount: 0,
        processing: false,
        workerCount: 1,
        metrics: {
          submitted: 0,
          succeeded: 0,
          failed: 0,
          byType: {
            PrepareFleetCommand: { submitted: 0, succeeded: 0, failed: 0 },
            DeployFleetCommand: { submitted: 0, succeeded: 0, failed: 0 },
          },
        },
      },
    });
  });

  it('reports command success and failure metrics', async () => {
    const app = createApp({ initialFuelTotal: 500 });

    const fleet = await request(app).post('/fleets').send({
      name: 'Metrics Fleet',
      shipCount: 5,
      fuelRequired: 100,
    });

    const prepare = await request(app).post('/commands').send({
      type: 'PrepareFleetCommand',
      payload: { fleetId: fleet.body.id },
    });
    await waitForCommand(app, prepare.body.id as string);

    const invalidDeploy = await request(app).post('/commands').send({
      type: 'DeployFleetCommand',
      payload: { fleetId: 'missing-fleet' },
    });
    await waitForCommand(app, invalidDeploy.body.id as string);

    const status = await request(app).get('/system/status');

    expect(status.body.queue.metrics).toMatchObject({
      submitted: 2,
      succeeded: 1,
      failed: 1,
      byType: {
        PrepareFleetCommand: { submitted: 1, succeeded: 1, failed: 0 },
        DeployFleetCommand: { submitted: 1, succeeded: 0, failed: 1 },
      },
      lastFailure: {
        commandId: invalidDeploy.body.id,
        type: 'DeployFleetCommand',
        message: 'Entity not found: missing-fleet',
      },
    });
    expect(status.body.queue.metrics.lastFailure.at).toBeDefined();
  });
});

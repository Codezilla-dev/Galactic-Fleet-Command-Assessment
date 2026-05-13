import request from 'supertest';

import { InMemoryCacheClient } from '../src/cache/cacheClient';
import { createApp } from '../src/app';
import { createPersistenceContext } from '../src/persistence/context';

async function waitForCommandStatus(
  app: ReturnType<typeof createApp>,
  commandId: string,
  status: 'Succeeded' | 'Failed',
): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const response = await request(app).get(`/commands/${commandId}`);
    if (response.body.status === status) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error(`Command did not reach ${status}: ${commandId}`);
}

describe('in-memory cache adapter', () => {
  it('supports hit, miss, and delete', () => {
    const cache = new InMemoryCacheClient();

    expect(cache.get('fleet:f1')).toBeUndefined();

    cache.set('fleet:f1', { id: 'f1' });
    expect(cache.get<{ id: string }>('fleet:f1')).toEqual({ id: 'f1' });

    cache.delete('fleet:f1');
    expect(cache.get('fleet:f1')).toBeUndefined();
  });

  it('caches fleet reads and invalidates on update', async () => {
    const context = createPersistenceContext();
    const app = createApp({ cache: new InMemoryCacheClient(), context });

    const created = await request(app).post('/fleets').send({
      name: 'Cache Fleet',
      shipCount: 3,
      fuelRequired: 50,
    });
    const fleetId = created.body.id as string;

    const firstRead = await request(app).get(`/fleets/${fleetId}`);
    expect(firstRead.body.name).toBe('Cache Fleet');

    const current = context.fleets.getOrThrow(fleetId);
    context.fleets.delete(fleetId, current.version);

    const cachedRead = await request(app).get(`/fleets/${fleetId}`);
    expect(cachedRead.status).toBe(200);
    expect(cachedRead.body.name).toBe('Cache Fleet');

    context.fleets.create({
      ...current,
      name: 'Cache Fleet',
      version: current.version + 1,
    });

    const patched = await request(app).patch(`/fleets/${fleetId}`).send({
      name: 'Updated Cache Fleet',
    });
    expect(patched.status).toBe(200);

    const refreshed = await request(app).get(`/fleets/${fleetId}`);
    expect(refreshed.body.name).toBe('Updated Cache Fleet');
  });

  it('invalidates cached command status on worker updates', async () => {
    const app = createApp({
      cache: new InMemoryCacheClient(),
      initialFuelTotal: 500,
    });

    const fleet = await request(app).post('/fleets').send({
      name: 'Command Cache Fleet',
      shipCount: 2,
      fuelRequired: 60,
    });
    const command = await request(app).post('/commands').send({
      type: 'PrepareFleetCommand',
      payload: { fleetId: fleet.body.id },
    });

    const commandId = command.body.id as string;
    await request(app).get(`/commands/${commandId}`);
    await waitForCommandStatus(app, commandId, 'Succeeded');

    const completed = await request(app).get(`/commands/${commandId}`);
    expect(completed.body.status).toBe('Succeeded');
  });
});

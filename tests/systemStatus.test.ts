import request from 'supertest';

import { createApp } from '../src/app';

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
      },
    });
  });
});

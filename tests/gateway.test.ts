import request from 'supertest';

import { createApp } from '../src/app';
import { resetGatewayRateLimits } from '../src/http/gateway';

describe('gateway middleware stubs', () => {
  beforeEach(() => {
    resetGatewayRateLimits();
  });

  it('echoes an incoming request id', async () => {
    const app = createApp();

    const res = await request(app).get('/health').set('x-request-id', 'req-123');

    expect(res.status).toBe(200);
    expect(res.header['x-request-id']).toBe('req-123');
  });

  it('allows requests without auth by default', async () => {
    const app = createApp();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.header['x-request-id']).toBeDefined();
  });

  it('can enforce the auth stub when configured', async () => {
    const app = createApp({ gateway: { authToken: 'secret' } });

    const unauthorized = await request(app).get('/health');
    const authorized = await request(app)
      .get('/health')
      .set('authorization', 'Bearer secret');

    expect(unauthorized.status).toBe(401);
    expect(authorized.status).toBe(200);
  });

  it('can enforce the rate-limit stub when configured', async () => {
    const app = createApp({
      gateway: { rateLimit: { enabled: true, maxRequests: 1 } },
    });

    const first = await request(app).get('/health');
    const second = await request(app).get('/health');

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('logs request completion metadata when configured', async () => {
    const logs: Array<{ message: string; metadata: Record<string, unknown> }> = [];
    const app = createApp({
      gateway: {
        logger: (message, metadata) => {
          logs.push({ message, metadata });
        },
      },
    });

    await request(app).get('/health').set('x-request-id', 'req-logged');

    expect(logs).toContainEqual({
      message: 'request.received',
      metadata: {
        method: 'GET',
        path: '/health',
        requestId: 'req-logged',
      },
    });
    expect(logs).toEqual(
      expect.arrayContaining([
        {
          message: 'request.completed',
          metadata: expect.objectContaining({
            method: 'GET',
            path: '/health',
            requestId: 'req-logged',
            statusCode: 200,
          }),
        },
      ]),
    );
  });

  it('returns structured error details with request id', async () => {
    const app = createApp();

    const res = await request(app)
      .post('/fleets')
      .set('x-request-id', 'req-error')
      .send({ name: '', shipCount: 1, fuelRequired: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Fleet name is required',
      code: 'VALIDATION_ERROR',
      requestId: 'req-error',
    });
  });
});

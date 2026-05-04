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
});

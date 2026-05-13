import request from 'supertest';

import { createApp } from '../src/app';
import { RecordingWebhookNotifier } from '../src/notifications/webhookNotifier';

async function waitForNotification(notifier: RecordingWebhookNotifier): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (notifier.completedCommands.length > 0) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error('Webhook notifier was not called');
}

describe('webhook notifier stub', () => {
  it('records command completion without making external calls', async () => {
    const webhookNotifier = new RecordingWebhookNotifier();
    const app = createApp({ initialFuelTotal: 500, webhookNotifier });

    const fleet = await request(app).post('/fleets').send({
      name: 'Webhook Fleet',
      shipCount: 2,
      fuelRequired: 80,
    });
    const command = await request(app).post('/commands').send({
      type: 'PrepareFleetCommand',
      payload: { fleetId: fleet.body.id },
    });

    await waitForNotification(webhookNotifier);

    expect(webhookNotifier.completedCommands).toHaveLength(1);
    expect(webhookNotifier.completedCommands[0].id).toBe(command.body.id);
    expect(webhookNotifier.completedCommands[0].status).toBe('Succeeded');
  });
});

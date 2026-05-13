import type { Command } from '../persistence';

export interface WebhookNotifier {
  readonly mode: string;
  notifyCommandCompleted(command: Command): Promise<void>;
}

export class NoopWebhookNotifier implements WebhookNotifier {
  readonly mode = 'noop';

  async notifyCommandCompleted(command: Command): Promise<void> {
    void command;
    await Promise.resolve();
  }
}

export class RecordingWebhookNotifier implements WebhookNotifier {
  readonly mode = 'recording';

  readonly completedCommands: Command[] = [];

  async notifyCommandCompleted(command: Command): Promise<void> {
    this.completedCommands.push(command);
    await Promise.resolve();
  }
}

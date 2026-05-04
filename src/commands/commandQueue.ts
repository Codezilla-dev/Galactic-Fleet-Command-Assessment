import { randomUUID } from 'node:crypto';

import type { CacheClient } from '../cache/cacheClient';
import { commandCacheKey, fleetCacheKey } from '../cache/cacheKeys';
import type { WebhookNotifier } from '../notifications/webhookNotifier';
import type {
  Command,
  CommandRepository,
  CommandStatus,
  PrepareFleetCommandPayload,
} from '../persistence';

import { PrepareFleetCommandHandler } from './prepareFleetCommandHandler';

function nowIso(): string {
  return new Date().toISOString();
}

export interface QueueStats {
  pendingCount: number;
  processing: boolean;
  workerCount: number;
}

export class InMemoryCommandQueue {
  private readonly queue: string[] = [];
  private processing = false;

  constructor(
    private readonly commands: CommandRepository,
    private readonly prepareFleetCommandHandler: PrepareFleetCommandHandler,
    private readonly cache?: CacheClient,
    private readonly webhookNotifier?: WebhookNotifier,
  ) {}

  submitPrepareFleetCommand(payload: PrepareFleetCommandPayload): Command {
    const command: Command = {
      id: randomUUID(),
      version: 1,
      type: 'PrepareFleetCommand',
      status: 'Queued',
      payload: { ...payload },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.commands.create(command);
    this.queue.push(command.id);
    this.kickWorker();
    return this.commands.getOrThrow(command.id);
  }

  getCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }

  getStats(): QueueStats {
    return {
      pendingCount: this.queue.length,
      processing: this.processing,
      workerCount: 1,
    };
  }

  private kickWorker(): void {
    if (this.processing) {
      return;
    }
    this.processing = true;
    setImmediate(() => {
      void this.processLoop();
    });
  }

  private async processLoop(): Promise<void> {
    while (this.queue.length > 0) {
      const commandId = this.queue.shift();
      if (commandId === undefined) {
        break;
      }
      await this.processCommand(commandId);
    }

    this.processing = false;
    if (this.queue.length > 0) {
      this.kickWorker();
    }
  }

  private async processCommand(commandId: string): Promise<void> {
    this.updateCommandStatus(commandId, 'Processing');
    const command = this.commands.getOrThrow(commandId);

    try {
      if (command.type === 'PrepareFleetCommand') {
        const fleetId = command.payload.fleetId;
        if (typeof fleetId !== 'string') {
          throw new Error('PrepareFleetCommand requires payload.fleetId');
        }
        await this.prepareFleetCommandHandler.execute(fleetId);
        this.cache?.delete(fleetCacheKey(fleetId));
      }
      const completed = this.updateCommandStatus(commandId, 'Succeeded');
      await this.notifyCompletion(completed);
    } catch (error) {
      const current = this.commands.getOrThrow(commandId);
      const message = error instanceof Error ? error.message : 'Unknown command failure';
      const fleetId = current.payload.fleetId;
      if (typeof fleetId === 'string') {
        this.cache?.delete(fleetCacheKey(fleetId));
      }
      this.commands.update(commandId, current.version, (existing) => ({
        ...existing,
        status: 'Failed',
        errorMessage: message,
        updatedAt: nowIso(),
      }));
      this.cache?.delete(commandCacheKey(commandId));
      await this.notifyCompletion(this.commands.getOrThrow(commandId));
    }
  }

  private updateCommandStatus(commandId: string, status: CommandStatus): Command {
    const current = this.commands.getOrThrow(commandId);
    this.commands.update(commandId, current.version, (command) => ({
      ...command,
      status,
      updatedAt: nowIso(),
    }));
    this.cache?.delete(commandCacheKey(commandId));
    return this.commands.getOrThrow(commandId);
  }

  private async notifyCompletion(command: Command): Promise<void> {
    try {
      await this.webhookNotifier?.notifyCommandCompleted(command);
    } catch {
      // Webhooks are a best-effort integration stub and should not change command state.
    }
  }
}

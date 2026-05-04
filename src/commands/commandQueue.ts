import { randomUUID } from 'node:crypto';

import type { CacheClient } from '../cache/cacheClient';
import { commandCacheKey, fleetCacheKey } from '../cache/cacheKeys';
import type { WebhookNotifier } from '../notifications/webhookNotifier';
import type {
  Command,
  CommandRepository,
  CommandStatus,
  CommandType,
  DeployFleetCommandPayload,
  PrepareFleetCommandPayload,
} from '../persistence';

import { DeployFleetCommandHandler } from './deployFleetCommandHandler';
import { PrepareFleetCommandHandler } from './prepareFleetCommandHandler';

function nowIso(): string {
  return new Date().toISOString();
}

export interface QueueStats {
  pendingCount: number;
  processing: boolean;
  workerCount: number;
  metrics: CommandQueueMetrics;
}

export interface CommandQueueMetrics {
  submitted: number;
  succeeded: number;
  failed: number;
  byType: Record<CommandType, { submitted: number; succeeded: number; failed: number }>;
  lastFailure?: {
    commandId: string;
    type: CommandType;
    message: string;
    at: string;
  };
}

export class InMemoryCommandQueue {
  private readonly queue: string[] = [];
  private processing = false;
  private readonly metrics: CommandQueueMetrics = {
    submitted: 0,
    succeeded: 0,
    failed: 0,
    byType: {
      PrepareFleetCommand: { submitted: 0, succeeded: 0, failed: 0 },
      DeployFleetCommand: { submitted: 0, succeeded: 0, failed: 0 },
    },
  };

  constructor(
    private readonly commands: CommandRepository,
    private readonly prepareFleetCommandHandler: PrepareFleetCommandHandler,
    private readonly deployFleetCommandHandler: DeployFleetCommandHandler,
    private readonly cache?: CacheClient,
    private readonly webhookNotifier?: WebhookNotifier,
  ) {}

  submitPrepareFleetCommand(payload: PrepareFleetCommandPayload): Command {
    return this.submitCommand('PrepareFleetCommand', payload);
  }

  submitDeployFleetCommand(payload: DeployFleetCommandPayload): Command {
    return this.submitCommand('DeployFleetCommand', payload);
  }

  private submitCommand(
    type: CommandType,
    payload: PrepareFleetCommandPayload | DeployFleetCommandPayload,
  ): Command {
    const command: Command = {
      id: randomUUID(),
      version: 1,
      type,
      status: 'Queued',
      payload: { ...payload },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.commands.create(command);
    this.recordSubmitted(type);
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
      metrics: {
        ...this.metrics,
        byType: {
          PrepareFleetCommand: { ...this.metrics.byType.PrepareFleetCommand },
          DeployFleetCommand: { ...this.metrics.byType.DeployFleetCommand },
        },
        lastFailure:
          this.metrics.lastFailure === undefined
            ? undefined
            : { ...this.metrics.lastFailure },
      },
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
      const fleetId = this.getFleetId(command);
      if (command.type === 'PrepareFleetCommand') {
        await this.prepareFleetCommandHandler.execute(fleetId);
        this.cache?.delete(fleetCacheKey(fleetId));
      } else if (command.type === 'DeployFleetCommand') {
        await this.deployFleetCommandHandler.execute(fleetId);
        this.cache?.delete(fleetCacheKey(fleetId));
      }
      const completed = this.updateCommandStatus(commandId, 'Succeeded');
      this.recordSucceeded(completed.type);
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
      const failed = this.commands.getOrThrow(commandId);
      this.recordFailed(failed, message);
      await this.notifyCompletion(failed);
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

  private getFleetId(command: Command): string {
    const fleetId = command.payload.fleetId;
    if (typeof fleetId !== 'string') {
      throw new Error(`${command.type} requires payload.fleetId`);
    }
    return fleetId;
  }

  private recordSubmitted(type: CommandType): void {
    this.metrics.submitted += 1;
    this.metrics.byType[type].submitted += 1;
  }

  private recordSucceeded(type: CommandType): void {
    this.metrics.succeeded += 1;
    this.metrics.byType[type].succeeded += 1;
  }

  private recordFailed(command: Command, message: string): void {
    this.metrics.failed += 1;
    this.metrics.byType[command.type].failed += 1;
    this.metrics.lastFailure = {
      commandId: command.id,
      type: command.type,
      message,
      at: nowIso(),
    };
  }
}

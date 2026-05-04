import { randomUUID } from 'node:crypto';

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

export class InMemoryCommandQueue {
  private readonly queue: string[] = [];
  private processing = false;

  constructor(
    private readonly commands: CommandRepository,
    private readonly prepareFleetCommandHandler: PrepareFleetCommandHandler,
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
      }
      this.updateCommandStatus(commandId, 'Succeeded');
    } catch (error) {
      const current = this.commands.getOrThrow(commandId);
      const message = error instanceof Error ? error.message : 'Unknown command failure';
      this.commands.update(commandId, current.version, (existing) => ({
        ...existing,
        status: 'Failed',
        errorMessage: message,
        updatedAt: nowIso(),
      }));
    }
  }

  private updateCommandStatus(commandId: string, status: CommandStatus): void {
    const current = this.commands.getOrThrow(commandId);
    this.commands.update(commandId, current.version, (command) => ({
      ...command,
      status,
      updatedAt: nowIso(),
    }));
  }
}

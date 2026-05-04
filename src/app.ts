import express from 'express';
import type { Request, Response } from 'express';

import { InMemoryCommandQueue } from './commands/commandQueue';
import { PrepareFleetCommandHandler } from './commands/prepareFleetCommandHandler';
import { InsufficientResourcesError, ValidationError } from './domain/errors';
import { FleetService } from './domain/fleetService';
import { ResourceReservationService } from './domain/resourceReservationService';
import { createGatewayMiddleware, type GatewayOptions } from './http/gateway';
import { createPersistenceContext, type PersistenceContext } from './persistence/context';
import { ConcurrencyError, DuplicateIdError, NotFoundError } from './persistence/types';

interface CreateAppOptions {
  context?: PersistenceContext;
  gateway?: GatewayOptions;
  initialFuelTotal?: number;
}

function parseFleetPayload(body: unknown): {
  id?: string;
  name: string;
  shipCount: number;
  fuelRequired: number;
} {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Body must be an object');
  }

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.name !== 'string') {
    throw new ValidationError('name is required');
  }
  if (typeof candidate.shipCount !== 'number') {
    throw new ValidationError('shipCount is required');
  }
  if (typeof candidate.fuelRequired !== 'number') {
    throw new ValidationError('fuelRequired is required');
  }

  const payload: {
    id?: string;
    name: string;
    shipCount: number;
    fuelRequired: number;
  } = {
    name: candidate.name,
    shipCount: candidate.shipCount,
    fuelRequired: candidate.fuelRequired,
  };

  if (typeof candidate.id === 'string') {
    payload.id = candidate.id;
  }
  return payload;
}

function parseFleetPatch(body: unknown): {
  name?: string;
  shipCount?: number;
  fuelRequired?: number;
} {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Body must be an object');
  }

  const candidate = body as Record<string, unknown>;
  const patch: { name?: string; shipCount?: number; fuelRequired?: number } = {};

  if ('name' in candidate) {
    if (typeof candidate.name !== 'string') {
      throw new ValidationError('name must be a string');
    }
    patch.name = candidate.name;
  }
  if ('shipCount' in candidate) {
    if (typeof candidate.shipCount !== 'number') {
      throw new ValidationError('shipCount must be a number');
    }
    patch.shipCount = candidate.shipCount;
  }
  if ('fuelRequired' in candidate) {
    if (typeof candidate.fuelRequired !== 'number') {
      throw new ValidationError('fuelRequired must be a number');
    }
    patch.fuelRequired = candidate.fuelRequired;
  }

  if (Object.keys(patch).length === 0) {
    throw new ValidationError('At least one updatable property is required');
  }

  return patch;
}

function parseCommandPayload(body: unknown): { type: 'PrepareFleetCommand'; payload: { fleetId: string } } {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Body must be an object');
  }

  const candidate = body as Record<string, unknown>;
  if (candidate.type !== 'PrepareFleetCommand') {
    throw new ValidationError('Only PrepareFleetCommand is supported');
  }

  if (typeof candidate.payload !== 'object' || candidate.payload === null) {
    throw new ValidationError('payload is required');
  }

  const payload = candidate.payload as Record<string, unknown>;
  if (typeof payload.fleetId !== 'string') {
    throw new ValidationError('payload.fleetId is required');
  }

  return {
    type: 'PrepareFleetCommand',
    payload: { fleetId: payload.fleetId },
  };
}

function sendError(error: unknown, res: Response): void {
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof ValidationError || error instanceof InsufficientResourcesError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof DuplicateIdError || error instanceof ConcurrencyError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const context = options.context ?? createPersistenceContext();
  const fleetService = new FleetService(context.fleets);
  const reservationService = new ResourceReservationService(context.resourcePools);
  reservationService.seedFuelPool(options.initialFuelTotal ?? 1000);
  const commandHandler = new PrepareFleetCommandHandler(fleetService, reservationService);
  const commandQueue = new InMemoryCommandQueue(context.commands, commandHandler);

  app.use(createGatewayMiddleware(options.gateway));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/fleets', (req: Request, res: Response) => {
    try {
      const payload = parseFleetPayload(req.body);
      const fleet = fleetService.createFleet(payload);
      res.status(201).json(fleet);
    } catch (error) {
      sendError(error, res);
    }
  });

  app.get('/fleets/:id', (req: Request, res: Response) => {
    try {
      const fleet = fleetService.getFleetOrThrow(req.params.id);
      res.status(200).json(fleet);
    } catch (error) {
      sendError(error, res);
    }
  });

  app.patch('/fleets/:id', (req: Request, res: Response) => {
    try {
      const patch = parseFleetPatch(req.body);
      const fleet = fleetService.updateFleet(req.params.id, patch);
      res.status(200).json(fleet);
    } catch (error) {
      sendError(error, res);
    }
  });

  app.post('/commands', (req: Request, res: Response) => {
    try {
      const command = parseCommandPayload(req.body);
      const created = commandQueue.submitPrepareFleetCommand(command.payload);
      res.status(202).json(created);
    } catch (error) {
      sendError(error, res);
    }
  });

  app.get('/commands/:id', (req: Request, res: Response) => {
    const command = commandQueue.getCommand(req.params.id);
    if (command === undefined) {
      res.status(404).json({ error: `Command not found: ${req.params.id}` });
      return;
    }
    res.status(200).json(command);
  });

  return app;
}


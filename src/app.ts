import express from 'express';
import type { Request, Response } from 'express';

import { InMemoryCacheClient, type CacheClient } from './cache/cacheClient';
import { commandCacheKey, fleetCacheKey } from './cache/cacheKeys';
import { InMemoryCommandQueue } from './commands/commandQueue';
import { DeployFleetCommandHandler } from './commands/deployFleetCommandHandler';
import { PrepareFleetCommandHandler } from './commands/prepareFleetCommandHandler';
import { FleetService } from './domain/fleetService';
import { ResourceReservationService } from './domain/resourceReservationService';
import { sendError } from './http/errors';
import { createGatewayMiddleware, type GatewayOptions } from './http/gateway';
import { parseCommandPayload } from './http/validators/commandValidators';
import { parseFleetPatch, parseFleetPayload } from './http/validators/fleetValidators';
import {
  NoopWebhookNotifier,
  type WebhookNotifier,
} from './notifications/webhookNotifier';
import { createPersistenceContext, type PersistenceContext } from './persistence/context';
import { STORAGE_MODE } from './persistence/storageMode';
import { NotFoundError } from './persistence/types';

interface CreateAppOptions {
  cache?: CacheClient;
  context?: PersistenceContext;
  gateway?: GatewayOptions;
  initialFuelTotal?: number;
  webhookNotifier?: WebhookNotifier;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const context = options.context ?? createPersistenceContext();
  const fleetService = new FleetService(context.fleets);
  const reservationService = new ResourceReservationService(context.resourcePools);
  reservationService.seedFuelPool(options.initialFuelTotal ?? 1000);
  const prepareFleetCommandHandler = new PrepareFleetCommandHandler(
    fleetService,
    reservationService,
  );
  const deployFleetCommandHandler = new DeployFleetCommandHandler(fleetService);
  const cache = options.cache ?? new InMemoryCacheClient();
  const webhookNotifier = options.webhookNotifier ?? new NoopWebhookNotifier();
  const commandQueue = new InMemoryCommandQueue(
    context.commands,
    prepareFleetCommandHandler,
    deployFleetCommandHandler,
    cache,
    webhookNotifier,
  );

  app.use(createGatewayMiddleware(options.gateway));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/system/status', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      architecture: {
        cache: cache.mode,
        gateway: 'express-middleware-stub',
        queue: 'in-memory-single-worker',
        storage: STORAGE_MODE,
        webhook: webhookNotifier.mode,
      },
      queue: commandQueue.getStats(),
    });
  });

  app.post('/fleets', (req: Request, res: Response) => {
    try {
      const payload = parseFleetPayload(req.body);
      const fleet = fleetService.createFleet(payload);
      cache.delete(fleetCacheKey(fleet.id));
      res.status(201).json(fleet);
    } catch (error) {
      sendError(error, res);
    }
  });

  app.get('/fleets/:id', (req: Request, res: Response) => {
    try {
      const cached = cache.get<ReturnType<FleetService['getFleetOrThrow']>>(
        fleetCacheKey(req.params.id),
      );
      if (cached !== undefined) {
        res.status(200).json(cached);
        return;
      }
      const fleet = fleetService.getFleetOrThrow(req.params.id);
      cache.set(fleetCacheKey(req.params.id), fleet);
      res.status(200).json(fleet);
    } catch (error) {
      sendError(error, res);
    }
  });

  app.patch('/fleets/:id', (req: Request, res: Response) => {
    try {
      const patch = parseFleetPatch(req.body);
      const fleet = fleetService.updateFleet(req.params.id, patch);
      cache.delete(fleetCacheKey(req.params.id));
      res.status(200).json(fleet);
    } catch (error) {
      sendError(error, res);
    }
  });

  app.post('/commands', (req: Request, res: Response) => {
    try {
      const command = parseCommandPayload(req.body);
      const created = command.type === 'PrepareFleetCommand'
        ? commandQueue.submitPrepareFleetCommand(command.payload)
        : commandQueue.submitDeployFleetCommand(command.payload);
      res.status(202).json(created);
    } catch (error) {
      sendError(error, res);
    }
  });

  app.get('/commands/:id', (req: Request, res: Response) => {
    try {
      const command = commandQueue.getCommand(req.params.id);
      const cached = cache.get<NonNullable<ReturnType<typeof commandQueue.getCommand>>>(
        commandCacheKey(req.params.id),
      );
      if (cached !== undefined) {
        res.status(200).json(cached);
        return;
      }
      if (command === undefined) {
        throw new NotFoundError(req.params.id, 'Command');
      }
      cache.set(commandCacheKey(req.params.id), command);
      res.status(200).json(command);
    } catch (error) {
      sendError(error, res);
    }
  });

  return app;
}


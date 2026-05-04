import express from 'express';
import type { Request, Response } from 'express';

import { InMemoryCacheClient, type CacheClient } from './cache/cacheClient';
import { commandCacheKey, fleetCacheKey } from './cache/cacheKeys';
import { InMemoryCommandQueue } from './commands/commandQueue';
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
  const commandHandler = new PrepareFleetCommandHandler(fleetService, reservationService);
  const cache = options.cache ?? new InMemoryCacheClient();
  const webhookNotifier = options.webhookNotifier ?? new NoopWebhookNotifier();
  const commandQueue = new InMemoryCommandQueue(
    context.commands,
    commandHandler,
    cache,
    webhookNotifier,
  );

  app.use(createGatewayMiddleware(options.gateway));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
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
      const created = commandQueue.submitPrepareFleetCommand(command.payload);
      res.status(202).json(created);
    } catch (error) {
      sendError(error, res);
    }
  });

  app.get('/commands/:id', (req: Request, res: Response) => {
    const command = commandQueue.getCommand(req.params.id);
    const cached = cache.get<NonNullable<ReturnType<typeof commandQueue.getCommand>>>(
      commandCacheKey(req.params.id),
    );
    if (cached !== undefined) {
      res.status(200).json(cached);
      return;
    }
    if (command === undefined) {
      res.status(404).json({ error: `Command not found: ${req.params.id}` });
      return;
    }
    cache.set(commandCacheKey(req.params.id), command);
    res.status(200).json(command);
  });

  return app;
}


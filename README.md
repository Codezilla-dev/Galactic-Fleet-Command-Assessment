# Galactic Fleet Command

## Overview

You are building a backend service for managing fleets in a fictional galactic command system. This system models fleets, processes commands asynchronously, and ensures that shared resources are allocated safely under concurrent conditions.

This exercise is designed to evaluate how you model systems, handle concurrency, design APIs, and make practical engineering tradeoffs.

## Time Expectation

This assignment is intended to take approximately 4-8 hours.

You are not expected to complete everything perfectly. Partial completion is acceptable as long as you document your decisions and tradeoffs.

## Tech Stack

Node.js and TypeScript plumbing have been included for you. If you prefer a different stack feel free to rebuild the base plumbing in your desired stack.  
Use in-memory storage only (no database required).  
You may use any libraries you feel are appropriate.

## Domain Model

Each fleet has a lifecycle:

Docked → Preparing → Ready → Deployed  
Preparing → FailedPreparation

Rules:

- Only fleets in Docked state can begin preparation
- A fleet must successfully reserve resources before becoming Ready
- If resource reservation fails, the fleet transitions to FailedPreparation
- Only Ready fleets can be deployed

A fleet should include at minimum:

- id
- name
- shipCount
- fuelRequired
- state

## Shared Resources

Assume a shared pool of resources (e.g., fuel).

Multiple fleets may attempt to reserve resources at the same time. Your system must ensure that resources are never over-allocated, even under concurrent requests.

## Commands

Commands represent actions performed on fleets and are processed asynchronously.

Required command:

PrepareFleetCommand

- Transitions fleet from Docked → Preparing
- Attempts to reserve resources
- On success → Ready
- On failure → FailedPreparation

Each command should have a status:

- Queued
- Processing
- Succeeded
- Failed

## Queue

Implement a simple in-memory queue:

- Commands are submitted via API
- A background worker processes commands asynchronously
- One worker is sufficient

Out of scope:

- Dead-letter queues
- Retry backoff strategies
- Scheduling or delayed execution
- Durable persistence

## API

Fleets:

POST /fleets — create a fleet  
GET /fleets/:id — retrieve a fleet  
PATCH /fleets/:id — update fleet properties

Commands:

POST /commands — submit a command  
GET /commands/:id — retrieve command status

System:

GET /health — health check

## Concurrency Requirement

Your system must correctly handle concurrent resource reservations.

Example: two commands attempt to reserve resources at the same time. Your system must ensure that resources are not double-allocated.

You may use any reasonable approach such as locks, mutexes, or other in-memory coordination strategies.

## Data Storage

Use in-memory data structures such as maps or arrays. No database is required.

## Testing

At minimum, include tests for:

- Valid and invalid fleet state transitions
- Resource reservation under concurrent conditions
- One end-to-end flow (API → command → state change)

## What We Care About

- Code clarity and structure
- Correctness of business logic
- Concurrency handling
- API design
- Thoughtful tradeoffs

## What We Do Not Expect

- Production-grade queue systems
- Advanced retry frameworks
- Full event sourcing implementations
- Complex infrastructure

## Bonus (Optional)

- Additional commands (e.g., DeployFleetCommand)
- Timeline/history of fleet transitions
- Logging or metrics
- Improved error handling

## Submission

Please include your source code and a short README describing:

- Design decisions
- Tradeoffs
- What you would improve with more time

## Implemented Solution

### Design Decisions

- Built on the provided Express + TypeScript scaffold and existing in-memory repositories.
- Added a `FleetService` domain layer to centralize fleet lifecycle validation and state transitions.
- Implemented asynchronous command execution through an in-memory queue with a single background worker.
- Modeled commands explicitly as `PrepareFleetCommand` with status lifecycle (`Queued`, `Processing`, `Succeeded`, `Failed`), timestamps, and failure message.
- Added a `ResourceReservationService` that uses optimistic locking (`version`) and bounded retries to prevent over-allocation under concurrent reservation attempts.
- Kept one shared `PersistenceContext` per app instance so API requests and background worker operate on consistent in-memory state.

### API Surface

- `POST /fleets` creates a fleet in `Docked` state.
- `GET /fleets/:id` returns a fleet.
- `PATCH /fleets/:id` updates mutable fleet properties (`name`, `shipCount`, `fuelRequired`).
- `POST /commands` enqueues `PrepareFleetCommand`.
- `GET /commands/:id` returns command execution status.
- `GET /health` returns service health.

### Concurrency Strategy

- Resource reservation is concurrency-safe via optimistic locking in `ResourcePoolRepository.update`.
- Reservation attempts re-read and retry on `ConcurrencyError` only.
- If fuel is insufficient, preparation fails and fleet transitions to `FailedPreparation`.
- Guarantees that `reserved` fuel never exceeds `total`.

### Tests Included

- Lifecycle tests for valid and invalid state transitions.
- Concurrency test validating no fuel over-allocation with concurrent reservations.
- End-to-end API test covering create fleet -> enqueue command -> async processing -> fleet moves to `Ready`.
- Existing health and persistence tests updated to reflect expanded fleet/command models.

### How To Run

- Install: `npm install`
- Start (dev): `npm run dev`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`

### Tradeoffs

- Uses in-memory queue and storage for simplicity and assignment scope; data is lost on restart.
- Single worker avoids distributed coordination complexity and keeps command execution deterministic.
- Focused only on required `PrepareFleetCommand`; no retries, scheduling, or dead-letter handling.
- Validation is intentionally lightweight and handled in app/domain layers rather than through an external schema library.

### Improvements With More Time

- Add `DeployFleetCommand` and command history/audit timeline.
- Add idempotency keys and stronger request validation schemas.
- Add observability: structured logs, queue metrics, command latency, failure counters.
- Add webhook/event notifications on command completion.
- Add graceful worker shutdown and explicit queue draining hooks for production deployment.

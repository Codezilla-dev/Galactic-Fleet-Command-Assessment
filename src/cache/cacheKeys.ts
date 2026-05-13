export function commandCacheKey(commandId: string): string {
  return `command:${commandId}`;
}

export function fleetCacheKey(fleetId: string): string {
  return `fleet:${fleetId}`;
}

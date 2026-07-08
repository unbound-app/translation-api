import { DISCORD_EPOCH_MS } from "@/config.ts";

export function snowflakeTimestamp(id: string): Date {
  const ms = (BigInt(id) >> 22n) + DISCORD_EPOCH_MS;
  return new Date(Number(ms));
}

export function accountAgeMs(id: string, now = Date.now()): number {
  return now - snowflakeTimestamp(id).getTime();
}

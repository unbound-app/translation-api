import { randomBytes } from "node:crypto";
import { env } from "@/config.ts";
import { redis } from "@/redis/client.ts";

const KEY_PREFIX = "oauth-state:";

export async function createOAuthState(): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  await redis.set(`${KEY_PREFIX}${state}`, "1", "EX", env.OAUTH_STATE_TTL_SECONDS);
  return state;
}

/** Single-use: the state is deleted on first (and only valid) use. */
export async function consumeOAuthState(state: string): Promise<boolean> {
  const deleted = await redis.del(`${KEY_PREFIX}${state}`);
  return deleted === 1;
}

import { redis } from "@/redis/client.ts";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** Fixed-window counter; the window resets on the key's first hit. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  return { allowed: count <= max, remaining: Math.max(0, max - count) };
}

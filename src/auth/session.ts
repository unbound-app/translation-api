import { randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/config.ts";
import { redis } from "@/redis/client.ts";

const secret = new TextEncoder().encode(env.SESSION_JWT_SECRET);
const REFRESH_KEY_PREFIX = "refresh:";

export interface SessionClaims {
  sub: string;
}

export async function issueSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secret);
  if (!payload.sub) {
    throw new Error("session token missing subject");
  }
  return { sub: payload.sub };
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await redis.set(`${REFRESH_KEY_PREFIX}${token}`, userId, "EX", env.REFRESH_TOKEN_TTL_SECONDS);
  return token;
}

/** Rotates on use: the old refresh token is consumed and cannot be replayed. */
export async function consumeRefreshToken(token: string): Promise<string | null> {
  const key = `${REFRESH_KEY_PREFIX}${token}`;
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key);
  return userId;
}

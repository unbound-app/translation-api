import type { Context, Next } from "hono";
import { env } from "@/config.ts";

const IOS_USER_AGENT = /^Discord\/\d+ CFNetwork\/[\d.]+ Darwin\/[\d.]+$/;
const ANDROID_USER_AGENT = /^Discord-Android\/\d+\b/;

const SENTRY_RELEASE = /(?:^|,)sentry-release=discord_(ios|android)%40/;
const SENTRY_TRACE = /^[0-9a-f]{32}-[0-9a-f]{16}(-[01])?$/;

function expectedHost(): string {
  return new URL(env.PUBLIC_BASE_URL).host;
}

export function looksLikeDiscordClient(c: Context): boolean {
  const userAgent = c.req.header("user-agent") ?? "";
  if (!IOS_USER_AGENT.test(userAgent) && !ANDROID_USER_AGENT.test(userAgent)) return false;

  const baggage = c.req.header("baggage") ?? "";
  if (!SENTRY_RELEASE.test(baggage)) return false;

  const sentryTrace = c.req.header("sentry-trace") ?? "";
  if (!SENTRY_TRACE.test(sentryTrace)) return false;

  if (c.req.header("host") !== expectedHost()) return false;

  return true;
}

export async function requireDiscordClient(c: Context, next: Next): Promise<Response | void> {
  if (!looksLikeDiscordClient(c)) {
    return c.body(null, 418);
  }
  await next();
}

import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

process.env.PUBLIC_BASE_URL ??= "https://translate.example.com";
process.env.DISCORD_CLIENT_ID ??= "1524261174240350318";
process.env.DISCORD_CLIENT_SECRET ??= "test-client-secret";
process.env.DISCORD_GUILD_ID ??= "950850315601711176";
process.env.DISCORD_REDIRECT_URI ??= "https://translate.example.com/auth/callback";
process.env.SESSION_JWT_SECRET ??= "test-session-jwt-secret-at-least-32-chars-long";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.LIBRETRANSLATE_URL ??= "http://localhost:5000";

const { env } = await import("@/config.ts");
const { requireDiscordClient } = await import("./discordClientGate.ts");

const REAL_IOS_HEADERS = {
  "user-agent": "Discord/104085 CFNetwork/3860.200.71 Darwin/25.1.0",
  baggage:
    "sentry-environment=stable,sentry-public_key=06e00b7472364e1986bc684e14371271,sentry-release=discord_ios%40334.0.104085%2B104085,sentry-trace_id=8fa31bd878f74224a4987596764a5db2",
  "sentry-trace": "8fa31bd878f74224a4987596764a5db2-b6da7e7de9024d85-0",
  host: new URL(env.PUBLIC_BASE_URL).host,
};

function buildApp() {
  const app = new Hono();
  app.get("/probe", requireDiscordClient, (c) => c.text("ok"));
  return app;
}

describe("requireDiscordClient", () => {
  test("allows a request with a real Discord iOS client's headers", async () => {
    const app = buildApp();
    const res = await app.request("/probe", { headers: REAL_IOS_HEADERS });
    expect(res.status).toBe(200);
  });

  test("rejects a request with no headers as 418", async () => {
    const app = buildApp();
    const res = await app.request("/probe");
    expect(res.status).toBe(418);
  });

  test("rejects a curl-like user-agent", async () => {
    const app = buildApp();
    const res = await app.request("/probe", {
      headers: { ...REAL_IOS_HEADERS, "user-agent": "curl/8.4.0" },
    });
    expect(res.status).toBe(418);
  });

  test("rejects a spoofed user-agent missing the sentry baggage", async () => {
    const app = buildApp();
    const res = await app.request("/probe", {
      headers: { "user-agent": REAL_IOS_HEADERS["user-agent"], host: REAL_IOS_HEADERS.host },
    });
    expect(res.status).toBe(418);
  });

  test("rejects when the host header doesn't match PUBLIC_BASE_URL", async () => {
    const app = buildApp();
    const res = await app.request("/probe", {
      headers: { ...REAL_IOS_HEADERS, host: "evil.example.com" },
    });
    expect(res.status).toBe(418);
  });
});

import type { Context, Next } from "hono";

const REDACTED_HEADERS = new Set(["authorization", "cookie", "set-cookie"]);

function collectHeaders(c: Context): Record<string, string> {
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? "[redacted]" : value;
  });
  return headers;
}

function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function requestLogger(c: Context, next: Next): Promise<void> {
  const start = performance.now();
  await next();
  const durationMs = Math.round(performance.now() - start);

  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
      ip: clientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
      headers: collectHeaders(c),
    }),
  );
}

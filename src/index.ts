import { Hono } from "hono";
import { AccessDeniedError, assertEligible, assertGuildMembership } from "@/auth/gate.ts";
import { consumeRefreshToken, issueRefreshToken, issueSession, verifySession } from "@/auth/session.ts";
import { consumeOAuthState, createOAuthState } from "@/auth/state.ts";
import { env } from "@/config.ts";
import { buildAuthorizeUrl, DiscordOAuthError, exchangeCodeForToken, fetchDiscordUser, revokeDiscordToken } from "@/discord/oauth.ts";
import { requireDiscordClient } from "@/security/discordClientGate.ts";
import { rateLimit } from "@/security/rateLimit.ts";
import { requestLogger } from "@/utils/requestLog.ts";

const app = new Hono();

app.use("*", requestLogger);
app.use("*", requireDiscordClient);

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

app.get("/auth/login", async (c) => {
  const limited = await rateLimit(`auth-ip:${clientIp(c)}`, env.RATE_LIMIT_AUTH_MAX, env.RATE_LIMIT_AUTH_WINDOW_SECONDS);
  if (!limited.allowed) return c.text("rate limit exceeded", 429);

  const state = await createOAuthState();
  return c.redirect(buildAuthorizeUrl(state));
});

app.get("/auth/callback", async (c) => {
  const limited = await rateLimit(`auth-ip:${clientIp(c)}`, env.RATE_LIMIT_AUTH_MAX, env.RATE_LIMIT_AUTH_WINDOW_SECONDS);
  if (!limited.allowed) return c.text("rate limit exceeded", 429);

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state || !(await consumeOAuthState(state))) {
    return c.text("invalid or expired oauth state", 400);
  }

  let accessToken: string;
  try {
    const token = await exchangeCodeForToken(code);
    accessToken = token.access_token;
  } catch (err) {
    return c.text(err instanceof DiscordOAuthError ? err.message : "discord token exchange failed", 502);
  }

  try {
    const user = await fetchDiscordUser(accessToken);
    assertEligible(user);
    await assertGuildMembership(accessToken);

    const [sessionToken, refreshToken] = await Promise.all([issueSession(user.id), issueRefreshToken(user.id)]);
    return c.json({ accessToken: sessionToken, refreshToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS });
  } catch (err) {
    await revokeDiscordToken(accessToken);
    if (err instanceof AccessDeniedError) return c.text(err.message, 403);
    if (err instanceof DiscordOAuthError) return c.text(err.message, 502);
    throw err;
  }
});

app.post("/auth/refresh", async (c) => {
  const limited = await rateLimit(`auth-ip:${clientIp(c)}`, env.RATE_LIMIT_AUTH_MAX, env.RATE_LIMIT_AUTH_WINDOW_SECONDS);
  if (!limited.allowed) return c.text("rate limit exceeded", 429);

  const body = await c.req.json().catch(() => undefined);
  const refreshToken = body?.refreshToken;
  if (typeof refreshToken !== "string") return c.text("missing refreshToken", 400);

  const userId = await consumeRefreshToken(refreshToken);
  if (!userId) return c.text("invalid or expired refresh token", 401);

  const [sessionToken, newRefreshToken] = await Promise.all([issueSession(userId), issueRefreshToken(userId)]);
  return c.json({ accessToken: sessionToken, refreshToken: newRefreshToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS });
});

app.post("/translate", async (c) => {
  const authHeader = c.req.header("authorization");
  const sessionToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (!sessionToken) return c.text("missing session token", 401);

  const claims = await verifySession(sessionToken).catch(() => undefined);
  if (!claims) return c.text("invalid or expired session", 401);

  const rawBody = await c.req.text();

  const limited = await rateLimit(`translate:${claims.sub}`, env.RATE_LIMIT_TRANSLATE_MAX, env.RATE_LIMIT_TRANSLATE_WINDOW_SECONDS);
  if (!limited.allowed) return c.text("rate limit exceeded", 429);

  let body: { q?: unknown; source?: unknown; target?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.text("invalid json body", 400);
  }
  if (typeof body.q !== "string" || body.q.length === 0 || body.q.length > env.MAX_TEXT_LENGTH) {
    return c.text("invalid or oversized q", 400);
  }
  const source = typeof body.source === "string" ? body.source : "auto";
  const target = typeof body.target === "string" ? body.target : "en";

  const upstream = await fetch(`${env.LIBRETRANSLATE_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: body.q, source, target, format: "text" }),
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
});

app.onError((err, c) => {
  console.error(err);
  return c.text("internal error", 500);
});

export default {
  port: env.PORT,
  fetch: app.fetch,
};

import { z } from "zod";
import { env } from "@/config.ts";

const DISCORD_API = "https://discord.com/api/v10";
export const OAUTH_SCOPES = "identify email guilds";

export function buildAuthorizeUrl(state: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.DISCORD_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.string(),
  token_type: z.string(),
});
export type DiscordTokenResponse = z.infer<typeof tokenResponseSchema>;

export const discordUserSchema = z.object({
  id: z.string().regex(/^\d{17,20}$/),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  verified: z.boolean().optional(),
  email: z.string().nullable().optional(),
});
export type DiscordUser = z.infer<typeof discordUserSchema>;

export class DiscordOAuthError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DiscordOAuthError";
  }
}

async function postForm(path: string, body: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new DiscordOAuthError(`Discord token endpoint returned ${res.status}`, await res.text().catch(() => undefined));
  }
  return res.json();
}

export async function exchangeCodeForToken(code: string): Promise<DiscordTokenResponse> {
  const json = await postForm("/oauth2/token", {
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });
  return tokenResponseSchema.parse(json);
}

export async function refreshDiscordToken(refreshToken: string): Promise<DiscordTokenResponse> {
  const json = await postForm("/oauth2/token", {
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return tokenResponseSchema.parse(json);
}

export async function revokeDiscordToken(token: string): Promise<void> {
  await postForm("/oauth2/token/revoke", {
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    token,
  }).catch(() => undefined);
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new DiscordOAuthError(`Discord /users/@me returned ${res.status}`, await res.text().catch(() => undefined));
  }
  return discordUserSchema.parse(await res.json());
}

const partialGuildSchema = z.object({
  id: z.string().regex(/^\d{17,20}$/),
});

// Uses the "guilds" scope on the *user's own* access token, so membership
// can be verified without a bot ever needing to sit in the guild.
export async function fetchUserGuildIds(accessToken: string): Promise<string[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new DiscordOAuthError(`Discord /users/@me/guilds returned ${res.status}`, await res.text().catch(() => undefined));
  }
  const guilds = z.array(partialGuildSchema).parse(await res.json());
  return guilds.map((g) => g.id);
}

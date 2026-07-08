import { env } from "@/config.ts";
import { fetchUserGuildIds, type DiscordUser } from "@/discord/oauth.ts";
import { accountAgeMs } from "@/discord/snowflake.ts";

const MIN_ACCOUNT_AGE_MS = env.MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

/** Checks everything derivable from the /users/@me response alone (no network calls). */
export function assertEligible(user: DiscordUser): void {
  if (!user.verified) {
    throw new AccessDeniedError("discord account email is not verified");
  }
  if (accountAgeMs(user.id) < MIN_ACCOUNT_AGE_MS) {
    throw new AccessDeniedError(`discord account is younger than ${env.MIN_ACCOUNT_AGE_DAYS} days`);
  }
}

// Membership is checked via the "guilds" scope on the user's own OAuth
// token against /users/@me/guilds — no bot needs to sit in the guild.
export async function assertGuildMembership(accessToken: string): Promise<void> {
  const guildIds = await fetchUserGuildIds(accessToken);
  if (!guildIds.includes(env.DISCORD_GUILD_ID)) {
    throw new AccessDeniedError("discord account is not a member of the required guild");
  }
}

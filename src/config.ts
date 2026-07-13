import { existsSync, statSync } from "node:fs";
import { z } from "zod";
import { fetchOnePasswordSecrets } from "@/utils/onePasswordSecrets.ts";

const snowflake = z.string().regex(/^\d{17,20}$/, "expected a Discord snowflake ID");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),

  PORT: z.coerce.number().int().positive().default(47281),

  PUBLIC_BASE_URL: z.string().url(),

  DISCORD_CLIENT_ID: snowflake,
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_GUILD_ID: snowflake,
  DISCORD_REDIRECT_URI: z.string().url(),

  MIN_ACCOUNT_AGE_DAYS: z.coerce.number().int().positive().default(365),

  SESSION_JWT_SECRET: z.string().min(32, "must be at least 32 chars, use a random hex/base64 string"),

  REDIS_URL: z.string().url(),

  LIBRETRANSLATE_URL: z.string().url(),

  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  RATE_LIMIT_TRANSLATE_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_TRANSLATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_AUTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

  MAX_TEXT_LENGTH: z.coerce.number().int().positive().default(2000),
});

export type Env = z.infer<typeof envSchema>;

function hasRegularEnvFile(): boolean {
  try {
    return statSync(".env").isFile();
  } catch {
    return false;
  }
}

const usesOnePassword = existsSync("/.dockerenv") || (!hasRegularEnvFile() && !process.env.DISCORD_CLIENT_ID);

async function loadEnv(): Promise<Env> {
  let source: NodeJS.ProcessEnv = process.env;

  if (usesOnePassword) {
    try {
      const secrets = await fetchOnePasswordSecrets();
      source = {
        ...process.env,
        PUBLIC_BASE_URL: secrets.publicBaseUrl,
        DISCORD_CLIENT_ID: secrets.discordClientId,
        DISCORD_CLIENT_SECRET: secrets.discordClientSecret,
        DISCORD_GUILD_ID: secrets.discordGuildId,
        DISCORD_REDIRECT_URI: secrets.discordRedirectUri,
        SESSION_JWT_SECRET: secrets.sessionJwtSecret,
      };
    } catch (error) {
      console.error("Failed to load secrets from 1Password:");
      console.error(error);
      process.exit(1);
    }
  }

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = await loadEnv();

export const DISCORD_EPOCH_MS = 1_420_070_400_000n;

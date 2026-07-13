import { OnePasswordConnect } from "@1password/connect";

const VAULT_TITLE = "Unbound";

const TRANSLATION_API_ITEM_ID = "ygndzglbyrwmzjhhllfd2ilzyq";

export interface OnePasswordSecrets {
  discordClientId: string;
  discordClientSecret: string;
  sessionJwtSecret: string;
  discordGuildId: string;
  publicBaseUrl: string;
  discordRedirectUri: string;
}

interface ItemField {
  label?: string;
  value?: string;
}

function fieldValue(fields: ItemField[] | undefined, label: string): string | undefined {
  return fields?.find((field) => field.label?.toLowerCase() === label.toLowerCase())?.value;
}

export async function fetchOnePasswordSecrets(): Promise<OnePasswordSecrets> {
  const token = process.env.OP_CONNECT_TOKEN;
  if (!token) {
    throw new Error("OP_CONNECT_TOKEN is not set; cannot fetch secrets from 1Password.");
  }

  const serverURL = process.env.OP_CONNECT_SERVER_URL;
  if (!serverURL) {
    throw new Error("OP_CONNECT_SERVER_URL is not set; cannot fetch secrets from 1Password.");
  }

  const op = OnePasswordConnect({
    serverURL,
    token,
    keepAlive: true,
  });

  const vault = await op.getVaultByTitle(VAULT_TITLE);
  if (!vault.id) {
    throw new Error(`Could not resolve the "${VAULT_TITLE}" 1Password vault.`);
  }

  const item = await op.getItemById(vault.id, TRANSLATION_API_ITEM_ID);

  const discordClientId = fieldValue(item.fields, "username");
  const discordClientSecret = fieldValue(item.fields, "credential");
  const sessionJwtSecret = fieldValue(item.fields, "jwt secret");
  const discordGuildId = fieldValue(item.fields, "guild id");
  const publicBaseUrl = fieldValue(item.fields, "base url");
  const discordRedirectUri = fieldValue(item.fields, "redirect uri");

  if (!discordClientId) {
    throw new Error('1Password item "translation api - discord auth" is missing its "username" field.');
  }
  if (!discordClientSecret) {
    throw new Error('1Password item "translation api - discord auth" is missing its "credential" field.');
  }
  if (!sessionJwtSecret) {
    throw new Error('1Password item "translation api - discord auth" is missing its "jwt secret" field.');
  }
  if (!discordGuildId) {
    throw new Error('1Password item "translation api - discord auth" is missing its "guild id" field.');
  }
  if (!publicBaseUrl) {
    throw new Error('1Password item "translation api - discord auth" is missing its "base url" field.');
  }
  if (!discordRedirectUri) {
    throw new Error('1Password item "translation api - discord auth" is missing its "redirect uri" field.');
  }

  return {
    discordClientId,
    discordClientSecret,
    sessionJwtSecret,
    discordGuildId,
    publicBaseUrl,
    discordRedirectUri,
  };
}

import { describe, expect, mock, test } from "bun:test";

interface FakeField {
  label?: string;
  value?: string;
}

interface FakeItem {
  fields?: FakeField[];
}

let vaultResponse: { id?: string } = { id: "vault-id" };
let itemResponse: FakeItem = { fields: [] };

const getVaultByTitle = mock(async () => vaultResponse);
const getItemById = mock(async (_vaultId: string, _itemId: string) => itemResponse);

mock.module("@1password/connect", () => ({
  OnePasswordConnect: mock(() => ({ getVaultByTitle, getItemById })),
}));

const { fetchOnePasswordSecrets } = await import("./onePasswordSecrets.ts");

const TRANSLATION_API_ITEM_ID = "ygndzglbyrwmzjhhllfd2ilzyq";

function setValidFields(overrideFields?: FakeField[]) {
  vaultResponse = { id: "vault-id" };
  itemResponse = {
    fields: overrideFields ?? [
      { label: "username", value: "1524261174240350318" },
      { label: "credential", value: "discord-client-secret-value" },
      { label: "jwt secret", value: "session-jwt-secret-value" },
      { label: "guild id", value: "950850315601711176" },
      { label: "base url", value: "https://translate.example.com" },
      { label: "redirect uri", value: "https://translate.example.com/auth/callback" },
    ],
  };
}

async function withToken<T>(token: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.OP_CONNECT_TOKEN;
  const previousServerURL = process.env.OP_CONNECT_SERVER_URL;
  if (token === undefined) {
    delete process.env.OP_CONNECT_TOKEN;
  } else {
    process.env.OP_CONNECT_TOKEN = token;
    process.env.OP_CONNECT_SERVER_URL = "https://1p.unbound.rip";
  }
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.OP_CONNECT_TOKEN;
    } else {
      process.env.OP_CONNECT_TOKEN = previous;
    }
    if (previousServerURL === undefined) {
      delete process.env.OP_CONNECT_SERVER_URL;
    } else {
      process.env.OP_CONNECT_SERVER_URL = previousServerURL;
    }
  }
}

describe("fetchOnePasswordSecrets", () => {
  test("throws when OP_CONNECT_TOKEN is not set", async () => {
    await withToken(undefined, async () => {
      await expect(fetchOnePasswordSecrets()).rejects.toThrow("OP_CONNECT_TOKEN is not set");
    });
  });

  test("throws when the vault cannot be resolved", async () => {
    setValidFields();
    vaultResponse = {};

    await withToken("test-token", async () => {
      await expect(fetchOnePasswordSecrets()).rejects.toThrow('Could not resolve the "Unbound" 1Password vault.');
    });
  });

  test("throws when the item is missing its username field", async () => {
    setValidFields([{ label: "credential", value: "secret" }]);

    await withToken("test-token", async () => {
      await expect(fetchOnePasswordSecrets()).rejects.toThrow(/translation api - discord auth.*username/);
    });
  });

  test("throws when the item is missing its credential field", async () => {
    setValidFields([{ label: "username", value: "1524261174240350318" }]);

    await withToken("test-token", async () => {
      await expect(fetchOnePasswordSecrets()).rejects.toThrow(/translation api - discord auth.*credential/);
    });
  });

  test("returns all secrets when every field is present", async () => {
    setValidFields();

    await withToken("test-token", async () => {
      const secrets = await fetchOnePasswordSecrets();
      expect(secrets).toEqual({
        discordClientId: "1524261174240350318",
        discordClientSecret: "discord-client-secret-value",
        sessionJwtSecret: "session-jwt-secret-value",
        discordGuildId: "950850315601711176",
        publicBaseUrl: "https://translate.example.com",
        discordRedirectUri: "https://translate.example.com/auth/callback",
      });
    });
  });

  test("matches field labels case-insensitively", async () => {
    setValidFields([
      { label: "USERNAME", value: "1524261174240350318" },
      { label: "CREDENTIAL", value: "discord-client-secret-value" },
      { label: "JWT SECRET", value: "session-jwt-secret-value" },
      { label: "GUILD ID", value: "950850315601711176" },
      { label: "BASE URL", value: "https://translate.example.com" },
      { label: "REDIRECT URI", value: "https://translate.example.com/auth/callback" },
    ]);

    await withToken("test-token", async () => {
      const secrets = await fetchOnePasswordSecrets();
      expect(secrets.discordClientId).toBe("1524261174240350318");
    });
  });

  test("fetches the item by id from the resolved vault", async () => {
    setValidFields();
    getItemById.mockClear();

    await withToken("test-token", async () => {
      await fetchOnePasswordSecrets();
    });

    expect(getItemById).toHaveBeenCalledWith("vault-id", TRANSLATION_API_ITEM_ID);
  });
});

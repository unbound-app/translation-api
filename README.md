# Translation API

Self-hosted translation backend. It runs [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) behind an auth-proxy, so only signed-in, authorized plugin users can reach it — LibreTranslate itself is never exposed to the public internet.

## Stack

- **LibreTranslate** — the translation engine
- **Redis** — backing store for the auth-proxy
- **auth-proxy** — the only service that is publicly reachable; everything goes through it

## Requirements

- Docker and Docker Compose
- A reverse proxy on the host (e.g. Caddy) to terminate TLS for your domain and forward to the auth-proxy's port
- A Discord application: <https://discord.com/developers/applications>

## Discord application setup

1. Create an application at the link above.
2. Under OAuth2, add a redirect URL matching whatever you set `DISCORD_REDIRECT_URI` to (e.g. `https://translate.example.com/auth/callback`).
3. Copy the **Client ID** and **Client Secret** into your `.env`.

## Configuration

Copy the example env file and fill it in:

```sh
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `PUBLIC_BASE_URL` | The public URL the auth-proxy is served at (behind your reverse proxy). |
| `DISCORD_CLIENT_ID` | From your Discord application. |
| `DISCORD_CLIENT_SECRET` | From your Discord application. |
| `DISCORD_GUILD_ID` | The ID of the Discord server users must belong to. |
| `DISCORD_REDIRECT_URI` | Must exactly match the redirect URL registered on the Discord application. |
| `SESSION_JWT_SECRET` | Random secret used to sign session tokens. Generate with `openssl rand -base64 48`. |

`PORT`, `REDIS_URL`, and `LIBRETRANSLATE_URL` are also in `.env.example` with sensible defaults; Docker Compose overrides them for the containers automatically, so you generally only need to touch them for local, non-Docker development. Additional tuning knobs (timeouts, rate limits, etc.) live in `src/config.ts` and all have working defaults.

## Running

```sh
docker compose up -d --build
```

This starts `libretranslate`, `redis`, and `auth-proxy`. Only `auth-proxy` publishes a port to the host (`127.0.0.1:47281` by default) — point your host's reverse proxy at that port for your public domain.

## Local development (without Docker)

```sh
bun install
bun run dev
```

Requires a Redis instance and a LibreTranslate instance reachable at whatever you set `REDIS_URL` / `LIBRETRANSLATE_URL` to in `.env`.

## API

### `GET /auth/login`

Redirects the user to Discord's OAuth consent screen.

### `GET /auth/callback`

Discord redirects here after the user consents. On success, responds with:

```json
{ "accessToken": "...", "refreshToken": "...", "expiresIn": 900 }
```

Use `accessToken` as a bearer token when calling `/translate`. Hold on to `refreshToken` so the plugin can get a new session without sending the user through Discord's consent screen again.

If the account doesn't meet the access requirements, the callback responds with an error instead of tokens.

### `POST /auth/refresh`

```json
{ "refreshToken": "..." }
```

Returns a new `accessToken` / `refreshToken` pair. Each refresh token can only be used once.

### `POST /translate`

Requires `Authorization: Bearer <accessToken>`.

```json
{ "q": "text to translate", "source": "auto", "target": "en" }
```

Returns whatever LibreTranslate's `/translate` endpoint returns.

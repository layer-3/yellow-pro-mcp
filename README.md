# yellow-pro-mcp

English | [简体中文](README.zh-CN.md)

MCP server + CLI exposing the **yellow_pro** exchange to AI agents — Claude Code,
Codex CLI, OpenClaw, Cursor, or any MCP client. Market data, account state, and
(when explicitly enabled) trading.

Follows the same conventions as the official OKX / Bybit / Alpaca exchange MCP
servers: local stdio process, credentials stay on your machine (environment
variables or your MCP client's local config — never sent anywhere else),
**read-only by default**, module filtering, built-in rate limiting, plus a CLI
and an agent skill file for non-MCP agents.

## Pairing onboarding preview

Pairing lets a Yellow Pro user connect Claude Code without copying an API key or
secret. Generate a short-lived pairing code in Yellow Pro, then run:

```bash
yellow-pro connect yp_pair_... --client claude-code --environment uat
```

The command:

1. Redeems the one-time code through Yellow Pro Auth.
2. Verifies the returned read-only credential against the trading API.
3. Stores it in `~/.yellow/config.json` with owner-only permissions.
4. Registers `yellow-pro-mcp` in Claude Code without putting secrets in Claude's config.

Restart Claude Code after setup, then check the connection at any time:

```bash
yellow-pro status
```

Remove the local credential with:

```bash
yellow-pro disconnect
```

Local disconnect does not revoke the remote API key. Revoke it in Yellow Pro.
The preview currently supports Claude Code and read-only primary-account credentials.
Use `--replace` to replace an existing local connection.

## One-liner install (for agents and humans)

Install from GitHub and register with Claude Code:

```bash
curl -fsSL -H 'Accept: application/vnd.github.raw+json' \
  'https://api.github.com/repos/layer-3/yellow-pro-mcp/contents/install.sh?ref=main' | bash && \
  YELLOW_PRO_API_KEY=... YELLOW_PRO_API_SECRET=... YELLOW_PRO_APP_SESSION_ID=... \
  yellow-pro setup claude-code
```

The installer checks Node.js >= 18, builds in a temporary directory, installs a
packed tarball globally, and removes the temporary files. If the system npm
prefix is not writable, it installs under `~/.local` instead. Inspect
`install.sh` before running it if your environment does not permit `curl | bash`.

Then register any MCP client with the installed server, for example Claude Code:

```bash
claude mcp add yellow_pro -s user \
  -e YELLOW_PRO_API_KEY=... -e YELLOW_PRO_API_SECRET=... -e YELLOW_PRO_APP_SESSION_ID=... \
  -- yellow-pro-mcp
```

The repo is public, so installation does not require GitHub credentials.

Multi-client setup — each registers the MCP server using your current
`YELLOW_PRO_*` environment:

```bash
yellow-pro setup claude-code   # via `claude mcp add` (user scope)
yellow-pro setup codex         # via `codex mcp add`, falls back to config.toml snippet
yellow-pro setup openclaw      # writes ~/.openclaw/openclaw.json mcpServers entry
yellow-pro setup hermes        # via `hermes mcp add`, falls back to config.yaml snippet
yellow-pro setup json          # prints generic MCP JSON for any other client
```

`npm i -g` (or a local checkout: `npm i -g /path/to/yellow_pro_mcp`) gives you two
commands: `yellow-pro-mcp` (MCP server) and `yellow-pro` (CLI).

### Manual config (any MCP client)

```toml
# Codex CLI (~/.codex/config.toml)
[mcp_servers.yellow_pro]
command = "yellow-pro-mcp"
env = { YELLOW_PRO_API_KEY = "...", YELLOW_PRO_API_SECRET = "...", YELLOW_PRO_APP_SESSION_ID = "..." }
```

```json
// OpenClaw (~/.openclaw/openclaw.json), Claude Desktop, Cursor, ...
{ "mcpServers": { "yellow_pro": { "command": "yellow-pro-mcp", "env": { "YELLOW_PRO_API_KEY": "..." } } } }
```

### Agent skill (non-MCP agents)

`skills/yellow-pro/SKILL.md` teaches agents to use the `yellow-pro` CLI — copy it
into your agent's skills directory (e.g. `~/.claude/skills/yellow-pro/`).

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `YELLOW_PRO_BASE_URL` | no | selected by `YELLOW_PRO_SANDBOX` | Explicit REST base URL override |
| `YELLOW_PRO_SANDBOX` | no | `false` | Exactly `true` uses staging (`https://api.staging.yellow.pro.neodax.app`); otherwise production (`https://trade.api.yellow.pro`) |
| `YELLOW_PRO_API_KEY` | private tools | — | API key |
| `YELLOW_PRO_API_SECRET` | private tools | — | API secret (HMAC-SHA256) |
| `YELLOW_PRO_APP_SESSION_ID` | private tools | — | app session id (`uid` credential) |
| `YELLOW_PRO_ENABLE_TRADING` | no | off | exactly `true` to enable trading tools/commands |
| `YELLOW_PRO_MODULES` | no | all | comma list of `market,account,trading` to filter tools |
| `YELLOW_PRO_RATE_LIMIT_MS` | no | `100` | min gap between requests (ms) |

Trading tools are **not registered** unless `YELLOW_PRO_ENABLE_TRADING=true`.
Market data tools work without credentials.
An explicit `YELLOW_PRO_BASE_URL` takes precedence over sandbox mode.

## Tools

- **market**: `get_health`, `get_markets`, `get_ticker`, `get_orderbook`, `get_klines`,
  `get_funding_rate`, `get_funding_rate_history`, `get_networks`, `get_transfer_assets`
- **account**: `get_balance`, `get_open_orders`, `get_order_history`, `get_my_trades`,
  `get_positions`, `get_position_history`, `get_position_history_detail`,
  `get_spot_accounts`, `get_spot_account`, `get_perpetual_accounts`, `get_fee_schedule`,
  `get_fee_tier`, `get_market_fee_rate`, `get_transaction_history`, `get_funding_payments`
- **trading** (opt-in): `place_order`, `cancel_order`, `cancel_all_orders`,
  `close_positions`, `set_leverage`, `transfer`

Markets use native ids: spot `ETHUSDT`, perpetual `BTCUSDT-PERP`.
Amounts and prices are decimal strings. All results are raw exchange JSON.

`place_order` supports the same common single-order types for Spot and Perpetual:

- `limit`: requires `price`
- `market`: no `price`
- `post_only`: requires `price` and guarantees the order is maker-only
- `trigger_limit` (Stop Limit): requires both `trigger_price` and `price`
- `trigger_market` (Stop Market): requires `trigger_price`

Perpetual markets have a per-market **position mode**, listed under
`position_modes` in `get_perpetual_accounts`. In `HEDGE` mode a market holds
separate long and short legs and orders take `direction` `long`/`short`
(defaulting from `side`, flipped by `reduce_only`). In `ONE_WAY` mode a market
holds a single net position and the exchange requires `direction: "both"` —
pass it explicitly, it is never inferred. Switching modes is only available in
the yellow_pro web UI.

Perpetual trigger orders also accept the optional `trigger_type` value
`stop_loss` or `take_profit`. Order queries return the classified conditional
type, such as `stop_limit`, `stop_loss`, `take_limit`, or `take_profit`.
`cancel_order` accepts either the request type (`trigger_*`) or these returned
types and normalizes Spot cancellation.

Most list tools use the documented opt-in cursor protocol. Omit `cursor` for
the first request; the MCP sends `use_cursor=true`. Pass the returned
`next_cursor` to fetch the next page. `page_size` defaults to 50 and is capped
at 100. Fill-level position history is cursor-native: its first request omits
both `cursor` and `use_cursor`, and its documented `page_size` maximum is 500.

The `yellow-pro` CLI mirrors the same surface — `yellow-pro --help`.

## Troubleshooting

**MCP client shows no tools / server fails to connect**

- Register through the CLI (`yellow-pro setup claude-code`, or `claude mcp add`
  directly) rather than editing config files by hand — Claude Code reads MCP config
  from `~/.claude.json`, not `~/.claude/settings.json`.
- The client spawns the server without loading your shell profile, so
  `yellow-pro-mcp` must be on the client's `PATH`. Check with `which yellow-pro-mcp`;
  if the installer printed a PATH hint, add that directory to your profile and
  restart the client.
- Restart the client after changing MCP config — servers connect at session start.
- Verify the server itself starts:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | yellow-pro-mcp
```

**Authentication errors (`invalid_api_key`, `invalid_timestamp`)**

- Private tools need all three of `YELLOW_PRO_API_KEY`, `YELLOW_PRO_API_SECRET`,
  `YELLOW_PRO_APP_SESSION_ID`, and they must match the environment you are hitting
  (`YELLOW_PRO_SANDBOX=true` keys do not work on production, and vice versa).
- `invalid_timestamp` means the machine clock is more than a few seconds off the
  exchange's — sync it (e.g. `sudo sntp -sS time.apple.com` on macOS, `chrony`/`ntp`
  on Linux).

**Trading commands fail with "trading is disabled"**

Set `YELLOW_PRO_ENABLE_TRADING=true` in the MCP client's env config. This is
intentional — do not work around it by calling the REST API directly.

## Risk warning

Trading involves risk of loss. Before use:

- **Protect your credentials** — grant API keys the minimum permissions needed and
  never commit them to source control.
- **Test on staging first** — run with `YELLOW_PRO_SANDBOX=true` against the staging
  environment before pointing at production.
- **Trading is off by default** — order/placement tools only exist when
  `YELLOW_PRO_ENABLE_TRADING=true`. Review every order the agent proposes before
  letting it through.
- **You are in control** — all actions are initiated by you or your AI assistant;
  the maintainers are not responsible for losses from agent behavior.

## Development

```bash
npm install
npm test          # signature vectors (cross-checked against the reference impl) + tool registration
npm run build
```

The endpoint and request contracts follow the current
[yellow_pro API documentation](https://docs.yellow.pro/api-and-programmatic-access/overview).
Not implemented on purpose: EIP-191/JWT auth and WebSocket streams.

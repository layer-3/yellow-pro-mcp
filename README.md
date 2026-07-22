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
  `get_funding_rate`, `get_funding_rate_history`
- **account**: `get_balance`, `get_open_orders`, `get_order_history`, `get_my_trades`,
  `get_positions`, `get_position_history`, `get_position_mode`, `get_fee_schedule`,
  `get_funding_payments`
- **trading** (opt-in): `place_order`, `cancel_order`, `cancel_orders` (batch), `set_leverage`,
  `set_position_mode`, `transfer`

Markets use native ids: spot `ETHUSDT`, perpetual `BTCUSDT-PERP`.
Amounts and prices are decimal strings. All results are raw exchange JSON.

The `yellow-pro` CLI mirrors the same surface — `yellow-pro --help`.

## Development

```bash
npm install
npm test          # signature vectors (cross-checked against the reference impl) + tool registration
npm run build
```

The wire protocol (HMAC canonicalization, endpoints, order fields) follows the
reference CCXT-style implementation in the internal `ccxt_cpp` repo
(`ts/src/neodax.ts`). Not implemented on purpose: EIP-191/JWT auth, WebSocket
streams — add when needed.

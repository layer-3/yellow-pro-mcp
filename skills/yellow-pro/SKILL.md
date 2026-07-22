---
name: yellow-pro
description: Fetch market data, manage account state, and place/cancel orders on the yellow_pro exchange using the yellow-pro CLI. Use when the user asks about yellow_pro markets, balances, positions, funding, or wants to trade there — especially from agents without MCP support.
---

# yellow_pro exchange CLI

The `yellow-pro` CLI wraps the yellow_pro REST API. All output is raw exchange JSON.
Prefer the `yellow_pro` MCP server when available; this CLI covers the same surface.

## Requirements

Environment variables (already set if the MCP server is configured):

- `YELLOW_PRO_API_KEY`, `YELLOW_PRO_API_SECRET`, `YELLOW_PRO_APP_SESSION_ID` — for account/trading commands
- `YELLOW_PRO_ENABLE_TRADING=true` — required for place/cancel/leverage/transfer commands
- `YELLOW_PRO_BASE_URL` — optional explicit URL override
- `YELLOW_PRO_SANDBOX=true` — use staging (`https://api.uat.yellow.pro.neodax.app`); otherwise production (`https://trade.api.yellow.pro`)

## Workflow

1. Discover markets first: `yellow-pro markets` — native ids look like `BTCYTEST.USD` (spot) and
   `BTCYTEST.USD-PERP` (perpetual). Check precision/filters before quoting amounts.
2. Market data: `yellow-pro ticker <market>`, `yellow-pro orderbook <market> --limit 10`,
   `yellow-pro klines <market> --interval 1h --limit 100`, `yellow-pro funding [market]`
3. Account: `yellow-pro balance spot` or `yellow-pro balance perp`,
   `yellow-pro open-orders perp`, `yellow-pro positions`,
   `yellow-pro trades perp --market <market>`
4. Trading (amounts/prices are decimal strings):
   - `yellow-pro place perp BTCYTEST.USD-PERP buy limit 0.1 70000 --leverage 5`
   - `yellow-pro place spot BTCYTEST.USD sell market 0.05`
   - `yellow-pro cancel perp BTCYTEST.USD-PERP <order_uuid>`
   - `yellow-pro set-leverage BTCYTEST.USD-PERP 10`
5. Run `yellow-pro --help` for the full command list.

## Safety

- Never place orders unless the user explicitly asked for them in this conversation.
- Confirm market id, side, amount, and price back to the user before placing an order.
- If a trading command fails with "trading is disabled", tell the user to set
  `YELLOW_PRO_ENABLE_TRADING=true` — do not work around it.

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
- `YELLOW_PRO_SANDBOX=true` — use staging (`https://api.staging.yellow.pro.neodax.app`); otherwise production (`https://trade.api.yellow.pro`)

## Workflow

1. Discover markets first: `yellow-pro markets` — native ids look like `ETHUSDT` (spot) and
   `BTCUSDT-PERP` (perpetual). Check precision/filters before quoting amounts.
2. Market data: `yellow-pro ticker <market>`, `yellow-pro orderbook <market>`,
   `yellow-pro klines <market> --interval 1h --limit 100`, `yellow-pro funding <market>`
3. Account: `yellow-pro balance spot` or `yellow-pro balance perp`,
   `yellow-pro open-orders perp`, `yellow-pro positions`,
   `yellow-pro trades perp --market <market>`, `yellow-pro fee-tier`
4. Trading (amounts/prices are decimal strings). For both Spot and Perpetual markets, an order
   amount is quantity in the market's base asset: `ETHUSDT` uses ETH and `BTCUSDT-PERP` uses BTC.
   Prices use the market's quote asset. Label both values with their correct units when confirming.
   - `yellow-pro place perp BTCUSDT-PERP buy limit 0.001 65000 --leverage 5 --client-order-id my-id`
   - `yellow-pro place spot ETHUSDT sell market 0.01`
   - `yellow-pro cancel perp BTCUSDT-PERP <order_uuid>`
   - `yellow-pro cancel-all perp --market BTCUSDT-PERP`
   - `yellow-pro close-positions --market BTCUSDT-PERP`
   - `yellow-pro set-leverage BTCUSDT-PERP 10`
5. Run `yellow-pro --help` for the full command list.

## Safety

- Never place orders unless the user explicitly asked for them in this conversation.
- Confirm market id, side, amount (quantity in the market's base asset), and price back to the user
  before placing an order.
- If a trading command fails with "trading is disabled", tell the user to set
  `YELLOW_PRO_ENABLE_TRADING=true` — do not work around it.

import { z } from "zod";

export const marketType = z.enum(["spot", "perp"]);
export const marketId = z.string().describe("market id, e.g. ETHUSDT or BTCUSDT-PERP");
export const cursor = z.string().min(1).optional()
  .describe("opaque next_cursor from the previous response; omit for the first page");
export const pageSize = z.number().int().min(1).max(100).optional()
  .describe("results per page (default 50, maximum 100)");
export const detailPageSize = z.number().int().min(1).max(500).optional()
  .describe("underlying fills per page (default 200, maximum 500)");
export const orderType = z.enum(["limit", "market", "post_only", "trigger_limit", "trigger_market"]);
export const cancelOrderType = z.enum([
  "limit", "market", "post_only", "trigger_limit", "trigger_market",
  "stop_limit", "stop_market", "stop_loss", "take_limit", "take_market", "take_profit",
]);
export const transactionType = z.enum([
  "funding_fee", "transfer", "fee", "realized_pnl", "liquidation", "adl",
]);

export const orderItem = {
  market: marketId,
  side: z.enum(["buy", "sell"]),
  order_type: orderType.describe(
    "limit/market; post_only guarantees maker-only; trigger_limit/trigger_market are Stop Limit/Stop Market",
  ),
  amount: z.string().describe("base amount as a decimal string"),
  price: z.string().optional().describe("required for limit, post_only, and trigger_limit orders"),
  trigger_price: z.string().optional().describe("required for trigger_limit and trigger_market orders"),
  trigger_type: z.enum(["stop_loss", "take_profit"]).optional()
    .describe("perp trigger orders only; optional stop-loss/take-profit classification"),
  time_in_force: z.string().optional()
    .describe("gtc/ioc/fok; default gtc for limit-style orders, ioc for market-style orders"),
  reduce_only: z.boolean().optional(),
  leverage: z.string().optional().describe("perp only, decimal string, default '1'"),
  direction: z.enum(["long", "short"]).optional()
    .describe("perp only; position leg, defaults from side (reduce_only flips it)"),
  client_order_id: z.string().optional().describe("perp only; client-supplied order id"),
};

export function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

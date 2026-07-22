/**
 * MCP server exposing yellow_pro to AI agents.
 *
 * Safety model (mirrors OKX/Bybit/Alpaca official MCP servers):
 * - local stdio process, credentials only via environment variables
 * - read-only by default; trading tools require YELLOW_PRO_ENABLE_TRADING=true
 * - module filtering via YELLOW_PRO_MODULES=market,account,trading
 * - crude client-side rate limiting (YELLOW_PRO_RATE_LIMIT_MS)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api, MarketType, OrderInput } from "./api.js";
import { clientFromEnv, YellowProClient } from "./client.js";
import { VERSION } from "./version.js";

export type Module = "market" | "account" | "trading";
export const ALL_MODULES: Module[] = ["market", "account", "trading"];

export interface ServerConfig {
  client: YellowProClient;
  enableTrading: boolean;
  modules: Module[];
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const modules = env.YELLOW_PRO_MODULES
    ? (env.YELLOW_PRO_MODULES.split(",").map((m) => m.trim()) as Module[])
    : ALL_MODULES;
  return {
    client: clientFromEnv(env),
    enableTrading: (env.YELLOW_PRO_ENABLE_TRADING ?? "").toLowerCase() === "true",
    modules,
  };
}

const marketType = z.enum(["spot", "perp"]);
const marketId = z.string().describe("market id, e.g. 'ETHUSDT' (spot) or 'BTCUSDT-PERP' (perp)");
const page = z.number().int().optional().describe("page number, 1-based");
const pageSize = z.number().int().optional().describe("results per page (default 100)");

const orderItem = {
  market: marketId.describe("market id, e.g. 'ETHUSDT' or 'BTCUSDT-PERP'"),
  side: z.enum(["buy", "sell"]),
  order_type: z.enum(["limit", "market"]),
  amount: z.string().describe("base amount as a decimal string"),
  price: z.string().optional().describe("required for limit orders"),
  time_in_force: z.string().optional().describe("gtc/ioc/fok; default gtc for limit, ioc for market"),
  reduce_only: z.boolean().optional(),
  leverage: z.string().optional().describe("perp only, decimal string, default '1'"),
  direction: z.enum(["long", "short", "both"]).optional()
    .describe("perp only; defaults from side (reduce_only flips it); one-way position mode requires 'both'"),
};

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function createServer(config: ServerConfig): McpServer {
  const { client, enableTrading, modules } = config;
  const server = new McpServer(
    { name: "yellow_pro", version: VERSION },
    {
      instructions:
        "yellow_pro exchange. Markets use native ids: spot like 'ETHUSDT', perpetual like " +
        "'BTCUSDT-PERP'. Call get_markets first to discover them. Amounts and prices are " +
        "decimal strings. Market data tools need no credentials; account/trading tools do.",
    },
  );

  if (modules.includes("market")) {
    server.registerTool(
      "get_health",
      { description: "Exchange connectivity/health check.", inputSchema: {} },
      async () => jsonResult(await api.health(client)),
    );
    server.registerTool(
      "get_markets",
      {
        description: "List tradable markets (exchange info, incl. precision/fees/leverage filters).",
        inputSchema: { market_type: z.enum(["spot", "perp", "all"]).default("all") },
      },
      async ({ market_type }) => jsonResult(await api.markets(client, market_type)),
    );
    server.registerTool(
      "get_ticker",
      {
        description: "24h ticker (last/min/max/volume/vwap) for a market id.",
        inputSchema: { market: marketId },
      },
      async ({ market }) => jsonResult(await api.ticker(client, market)),
    );
    server.registerTool(
      "get_orderbook",
      {
        description: "Order book bids/asks for a market id.",
        inputSchema: { market: marketId, limit: z.number().int().optional() },
      },
      async ({ market, limit }) => jsonResult(await api.orderbook(client, market, limit)),
    );
    server.registerTool(
      "get_klines",
      {
        description: "OHLCV candles. Intervals: 1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M.",
        inputSchema: {
          market: marketId,
          interval: z.string().default("1m"),
          start_time: z.number().int().optional().describe("earliest candle, ms timestamp"),
          limit: z.number().int().optional(),
        },
      },
      async ({ market, interval, start_time, limit }) =>
        jsonResult(await api.klines(client, market, interval, start_time, limit)),
    );
    server.registerTool(
      "get_funding_rate",
      {
        description: "Current perpetual funding rate for one market, or all markets when omitted.",
        inputSchema: { market: marketId.optional() },
      },
      async ({ market }) => jsonResult(await api.fundingRate(client, market)),
    );
    server.registerTool(
      "get_funding_rate_history",
      {
        description: "Historical perpetual funding rates, paginated.",
        inputSchema: { market: marketId.optional(), page, page_size: pageSize },
      },
      async ({ market, page: p, page_size }) =>
        jsonResult(await api.fundingRateHistory(client, market, { page: p, page_size })),
    );
  }

  if (modules.includes("account")) {
    server.registerTool(
      "get_balance",
      { description: "Account balances (spot or perpetual).", inputSchema: { market_type: marketType } },
      async ({ market_type }) => jsonResult(await api.balance(client, market_type)),
    );
    server.registerTool(
      "get_open_orders",
      {
        description: "Open orders, optionally filtered by market id.",
        inputSchema: { market_type: marketType, market: marketId.optional(), page, page_size: pageSize },
      },
      async ({ market_type, market, page: p, page_size }) =>
        jsonResult(await api.openOrders(client, market_type, market, { page: p, page_size })),
    );
    server.registerTool(
      "get_order_history",
      {
        description: "Historical orders for a market (filter closed/canceled client-side by 'state').",
        inputSchema: { market_type: marketType, market: marketId, page, page_size: pageSize },
      },
      async ({ market_type, market, page: p, page_size }) =>
        jsonResult(await api.orderHistory(client, market_type, market, { page: p, page_size })),
    );
    server.registerTool(
      "get_my_trades",
      {
        description: "Account trade fills, paginated. start_time/end_time (ms) are perp-only.",
        inputSchema: {
          market_type: marketType,
          market: marketId.optional(),
          page,
          page_size: pageSize,
          start_time: z.number().int().optional(),
          end_time: z.number().int().optional(),
        },
      },
      async ({ market_type, market, page: p, page_size, start_time, end_time }) =>
        jsonResult(
          await api.myTrades(client, market_type, market, { page: p, page_size, start_time, end_time }),
        ),
    );
    server.registerTool(
      "get_positions",
      { description: "Open perpetual positions.", inputSchema: {} },
      async () => jsonResult(await api.positions(client)),
    );
    server.registerTool(
      "get_position_history",
      {
        description: "Closed perpetual position history, paginated.",
        inputSchema: { market: marketId.optional(), page, page_size: pageSize },
      },
      async ({ market, page: p, page_size }) =>
        jsonResult(await api.positionHistory(client, market, { page: p, page_size })),
    );
    server.registerTool(
      "get_position_mode",
      {
        description: "Perpetual accounts incl. position_modes map (market id -> HEDGE|ONE_WAY).",
        inputSchema: {},
      },
      async () => jsonResult(await api.positionMode(client)),
    );
    server.registerTool(
      "get_fee_schedule",
      { description: "Authoritative exchange fee tier schedule.", inputSchema: {} },
      async () => jsonResult(await api.feeSchedule(client)),
    );
    server.registerTool(
      "get_funding_payments",
      {
        description: "Funding payments, account-wide or for a position UUID.",
        inputSchema: {
          scope: z.enum(["account", "position"]).default("account"),
          position_id: z.string().optional().describe("required when scope=position"),
          page,
          page_size: pageSize,
        },
      },
      async ({ scope, position_id, page: p, page_size }) =>
        jsonResult(await api.fundingPayments(client, scope, position_id, { page: p, page_size })),
    );
  }

  if (modules.includes("trading") && enableTrading) {
    server.registerTool(
      "place_order",
      {
        description:
          "Place a single order. Returns order_uuid. price required for limit orders. " +
          "Perp orders default to cross margin.",
        inputSchema: { market_type: marketType, ...orderItem },
      },
      async ({ market_type, ...order }) =>
        jsonResult(await api.placeOrder(client, market_type, order as OrderInput)),
    );
    server.registerTool(
      "cancel_order",
      {
        description: "Cancel an open order by order_uuid. order_type only matters for spot (default limit).",
        inputSchema: {
          market_type: marketType,
          market: marketId,
          order_id: z.string(),
          order_type: z.enum(["limit", "market"]).default("limit"),
        },
      },
      async ({ market_type, market, order_id, order_type }) =>
        jsonResult(await api.cancelOrder(client, market_type, market, order_id, order_type)),
    );
    server.registerTool(
      "cancel_orders",
      {
        description: "Cancel multiple orders on one market in a single batch request.",
        inputSchema: { market_type: marketType, market: marketId, order_ids: z.array(z.string()).min(1) },
      },
      async ({ market_type, market, order_ids }) =>
        jsonResult(await api.cancelOrders(client, market_type, market, order_ids)),
    );
    server.registerTool(
      "set_leverage",
      {
        description: "Set leverage for a perpetual market (decimal string >= 1).",
        inputSchema: { market: marketId, leverage: z.string() },
      },
      async ({ market, leverage }) => jsonResult(await api.setLeverage(client, market, leverage)),
    );
    server.registerTool(
      "set_position_mode",
      {
        description: "Set perpetual position mode for a market: hedged=true -> HEDGE, false -> ONE_WAY.",
        inputSchema: { market: marketId, hedged: z.boolean() },
      },
      async ({ market, hedged }) => jsonResult(await api.setPositionMode(client, market, hedged)),
    );
    server.registerTool(
      "transfer",
      {
        description: "Transfer an asset between spot and perps accounts.",
        inputSchema: {
          asset: z.string().describe("asset symbol, e.g. 'USD'"),
          amount: z.string().describe("decimal string"),
          from_account: z.enum(["spot", "perps"]),
          to_account: z.enum(["spot", "perps"]),
        },
      },
      async ({ asset, amount, from_account, to_account }) =>
        jsonResult(await api.transfer(client, asset, amount, from_account, to_account)),
    );
  }

  return server;
}

export async function main(): Promise<void> {
  await createServer(configFromEnv()).connect(new StdioServerTransport());
}

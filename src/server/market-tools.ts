import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../api.js";
import type { YellowProClient } from "../client.js";
import { cursor, jsonResult, marketId, pageSize } from "./shared.js";

export function registerMarketTools(server: McpServer, client: YellowProClient): void {
  server.registerTool(
    "get_health",
    { description: "Exchange connectivity/health check.", inputSchema: {} },
    async () => jsonResult(await api.health(client)),
  );
  server.registerTool(
    "get_markets",
    {
      description: "List tradable markets including precision, fees, and leverage filters.",
      inputSchema: { market_type: z.enum(["spot", "perp", "all"]).default("all") },
    },
    async ({ market_type }) => jsonResult(await api.markets(client, market_type)),
  );
  server.registerTool(
    "get_ticker",
    {
      description: "24h ticker statistics for a market.",
      inputSchema: { market: marketId },
    },
    async ({ market }) => jsonResult(await api.ticker(client, market)),
  );
  server.registerTool(
    "get_orderbook",
    {
      description: "Order book bids and asks for a market.",
      inputSchema: { market: marketId },
    },
    async ({ market }) => jsonResult(await api.orderbook(client, market)),
  );
  server.registerTool(
    "get_klines",
    {
      description: "OHLCV candles for a market.",
      inputSchema: {
        market: marketId,
        interval: z.string().default("1m"),
        start_time: z.number().int().optional().describe("earliest candle, ms timestamp"),
        end_time: z.number().int().optional().describe("latest candle, ms timestamp"),
        limit: z.number().int().min(1).max(1000).optional(),
      },
    },
    async ({ market, interval, start_time, end_time, limit }) =>
      jsonResult(await api.klines(client, market, { interval, start_time, end_time, limit })),
  );
  server.registerTool(
    "get_funding_rate",
    {
      description: "Current perpetual funding rate for one market.",
      inputSchema: { market: marketId },
    },
    async ({ market }) => jsonResult(await api.fundingRate(client, market)),
  );
  server.registerTool(
    "get_funding_rate_history",
    {
      description: "Historical perpetual funding rates with cursor pagination.",
      inputSchema: { market: marketId.optional(), cursor, page_size: pageSize },
    },
    async ({ market, cursor: nextCursor, page_size }) =>
      jsonResult(await api.fundingRateHistory(client, market, { cursor: nextCursor, page_size })),
  );
  server.registerTool(
    "get_networks",
    { description: "Supported blockchain networks and deposit/withdrawal tokens.", inputSchema: {} },
    async () => jsonResult(await api.networks(client)),
  );
  server.registerTool(
    "get_transfer_assets",
    { description: "Public active stablecoin assets configured for spot/perps transfer.", inputSchema: {} },
    async () => jsonResult(await api.transferAssets(client)),
  );
}

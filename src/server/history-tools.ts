import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../api.js";
import type { YellowProClient } from "../client.js";
import {
  cursor,
  detailPageSize,
  jsonResult,
  marketId,
  marketType,
  pageSize,
  transactionType,
} from "./shared.js";

const marketLike = z.string().optional().describe("case-insensitive market substring filter");
const rfc3339 = z.string().optional().describe("RFC3339 or RFC3339Nano timestamp");

export function registerHistoryTools(server: McpServer, client: YellowProClient): void {
  server.registerTool(
    "get_open_orders",
    {
      description: "Open orders with cursor pagination and documented Spot/Perp filters.",
      inputSchema: {
        market_type: marketType,
        market: marketId.optional(),
        asset: z.string().optional().describe("Spot only; fuzzy asset-symbol filter"),
        market_like: marketLike.describe("Perp only; fuzzy market filter"),
        cursor,
        page_size: pageSize,
      },
    },
    async ({ market_type, market, asset, market_like, cursor: nextCursor, page_size }) =>
      jsonResult(await api.openOrders(client, market_type, {
        market,
        asset,
        market_like,
        cursor: nextCursor,
        page_size,
      })),
  );
  server.registerTool(
    "get_order_history",
    {
      description: "Historical orders with cursor pagination.",
      inputSchema: {
        market_type: marketType,
        market: marketId.optional(),
        market_like: marketLike.describe("Perp only; fuzzy market filter"),
        cursor,
        page_size: pageSize,
      },
    },
    async ({ market_type, market, market_like, cursor: nextCursor, page_size }) =>
      jsonResult(await api.orderHistory(client, market_type, {
        market,
        market_like,
        cursor: nextCursor,
        page_size,
      })),
  );
  server.registerTool(
    "get_my_trades",
    {
      description: "Account trade fills with cursor pagination; time and fuzzy filters are Perp-only.",
      inputSchema: {
        market_type: marketType,
        market: marketId.optional(),
        market_like: marketLike,
        start_time: rfc3339,
        end_time: rfc3339,
        cursor,
        page_size: pageSize,
      },
    },
    async ({ market_type, market, market_like, start_time, end_time, cursor: nextCursor, page_size }) =>
      jsonResult(await api.myTrades(client, market_type, {
        market,
        market_like,
        start_time,
        end_time,
        cursor: nextCursor,
        page_size,
      })),
  );
  server.registerTool(
    "get_position_history",
    {
      description: "Closed perpetual positions with cursor pagination and time/sort filters.",
      inputSchema: {
        market: marketId.optional(),
        opened_from: rfc3339,
        opened_to: rfc3339,
        closed_from: rfc3339,
        closed_to: rfc3339,
        sort_by: z.enum(["opened_at", "closed_at"]).optional(),
        sort_dir: z.enum(["asc", "desc"]).optional(),
        cursor,
        page_size: pageSize,
      },
    },
    async ({ cursor: nextCursor, page_size, ...filters }) =>
      jsonResult(await api.positionHistory(client, { ...filters, cursor: nextCursor, page_size })),
  );
  server.registerTool(
    "get_position_history_detail",
    {
      description: "Fill-level cursor-paginated history for one closed perpetual position.",
      inputSchema: { position_id: z.string(), cursor, page_size: detailPageSize },
    },
    async ({ position_id, cursor: nextCursor, page_size }) =>
      jsonResult(await api.positionHistoryDetail(client, position_id, {
        cursor: nextCursor,
        page_size,
      })),
  );
  server.registerTool(
    "get_transaction_history",
    {
      description: "Unified perpetual balance-changing transaction history.",
      inputSchema: {
        type: transactionType.optional(),
        market: marketId.optional(),
        asset: z.string().optional(),
        start_time: z.number().int().optional().describe("inclusive Unix timestamp in seconds"),
        end_time: z.number().int().optional().describe("inclusive Unix timestamp in seconds"),
        cursor,
        page_size: pageSize,
      },
    },
    async ({ cursor: nextCursor, page_size, ...filters }) =>
      jsonResult(await api.transactionHistory(client, { ...filters, cursor: nextCursor, page_size })),
  );
  server.registerTool(
    "get_funding_payments",
    {
      description: "Funding payments, account-wide or for one position, with cursor pagination.",
      inputSchema: {
        scope: z.enum(["account", "position"]).default("account"),
        position_id: z.string().optional().describe("required when scope=position"),
        interval_start: rfc3339,
        cursor,
        page_size: pageSize,
      },
    },
    async ({ scope, position_id, interval_start, cursor: nextCursor, page_size }) =>
      jsonResult(await api.fundingPayments(client, {
        scope,
        position_id,
        interval_start,
        cursor: nextCursor,
        page_size,
      })),
  );
}

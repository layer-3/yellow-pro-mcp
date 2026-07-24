import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, type OrderInput } from "../api.js";
import type { YellowProClient } from "../client.js";
import {
  cancelOrderType,
  jsonResult,
  marketId,
  marketType,
  orderItem,
} from "./shared.js";

export function registerTradingTools(server: McpServer, client: YellowProClient): void {
  server.registerTool(
    "place_order",
    {
      description:
        "Place one limit, market, post-only, Stop Limit, or Stop Market order. Perpetuals use cross margin.",
      inputSchema: { market_type: marketType, ...orderItem },
    },
    async ({ market_type, ...order }) => {
      const input: OrderInput = order;
      return jsonResult(await api.placeOrder(client, market_type, input));
    },
  );
  server.registerTool(
    "cancel_order",
    {
      description: "Cancel one open order by order_uuid.",
      inputSchema: {
        market_type: marketType,
        market: marketId,
        order_id: z.string(),
        order_type: cancelOrderType.default("limit"),
      },
    },
    async ({ market_type, market, order_id, order_type }) =>
      jsonResult(await api.cancelOrder(client, market_type, {
        market,
        order_id,
        order_type,
      })),
  );
  server.registerTool(
    "cancel_all_orders",
    {
      description: "Cancel all open orders for an account, optionally limited to one market.",
      inputSchema: { market_type: marketType, market: marketId.optional() },
    },
    async ({ market_type, market }) =>
      jsonResult(await api.cancelAllOrders(client, market_type, market)),
  );
  server.registerTool(
    "close_positions",
    {
      description: "Close all available perpetual position legs, optionally limited to one market.",
      inputSchema: { market: marketId.optional() },
    },
    async ({ market }) => jsonResult(await api.closePositions(client, market)),
  );
  server.registerTool(
    "set_leverage",
    {
      description: "Set leverage for a perpetual market.",
      inputSchema: { market: marketId, leverage: z.string() },
    },
    async ({ market, leverage }) => jsonResult(await api.setLeverage(client, market, leverage)),
  );
  server.registerTool(
    "transfer",
    {
      description: "Transfer an asset between Spot and Perps accounts.",
      inputSchema: {
        asset: z.string(),
        amount: z.string().describe("decimal string"),
        from_account: z.enum(["spot", "perps"]),
        to_account: z.enum(["spot", "perps"]),
      },
    },
    async ({ asset, amount, from_account, to_account }) =>
      jsonResult(await api.transfer(client, { asset, amount, from_account, to_account })),
  );
}

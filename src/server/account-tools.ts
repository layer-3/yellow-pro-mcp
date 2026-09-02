import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api } from "../api.js";
import type { YellowProClient } from "../client.js";
import { jsonResult, marketId, marketType } from "./shared.js";

const asset = z.string().optional();
const assetLike = z.string().optional().describe("case-insensitive substring match on asset symbol");

export function registerAccountTools(server: McpServer, client: YellowProClient): void {
  server.registerTool(
    "get_balance",
    {
      description: "Spot account balances or perpetual balance. Asset filters apply to Spot only.",
      inputSchema: { market_type: marketType, asset, asset_like: assetLike },
    },
    async ({ market_type, asset: exactAsset, asset_like }) =>
      jsonResult(await api.balance(client, market_type, { asset: exactAsset, asset_like })),
  );
  server.registerTool(
    "get_spot_accounts",
    {
      description:
        "Spot accounts for the authenticated principal. HMAC keys bound to one app_session_id return only that session; JWT still lists every wallet-owned account. Prefer get_spot_account when verifying agent sub-account isolation.",
      inputSchema: {},
    },
    async () => jsonResult(await api.spotAccounts(client)),
  );
  server.registerTool(
    "get_spot_account",
    {
      description: "Current Spot account details and balances, optionally filtered by asset.",
      inputSchema: { asset, asset_like: assetLike },
    },
    async ({ asset: exactAsset, asset_like }) =>
      jsonResult(await api.spotAccount(client, { asset: exactAsset, asset_like })),
  );
  server.registerTool(
    "get_positions",
    { description: "Open perpetual position legs.", inputSchema: {} },
    async () => jsonResult(await api.positions(client)),
  );
  server.registerTool(
    "get_perpetual_accounts",
    {
      description:
        "Perpetual accounts including balances, positions, equity, and initial leverage. HMAC keys bound to one app_session_id return only that session; JWT still lists every wallet-owned account. Prefer get_balance for agent isolation checks.",
      inputSchema: {},
    },
    async () => jsonResult(await api.perpetualAccounts(client)),
  );
  server.registerTool(
    "get_fee_schedule",
    { description: "Public exchange fee tier schedule.", inputSchema: {} },
    async () => jsonResult(await api.feeSchedule(client)),
  );
  server.registerTool(
    "get_fee_tier",
    { description: "Authenticated user's current fee tier and effective rates.", inputSchema: {} },
    async () => jsonResult(await api.feeTier(client)),
  );
  server.registerTool(
    "get_market_fee_rate",
    {
      description: "Authenticated account's effective maker/taker rate for one Spot or Perp market.",
      inputSchema: { market_type: marketType, market: marketId },
    },
    async ({ market_type, market }) =>
      jsonResult(await api.marketFeeRate(client, market_type, market)),
  );
}

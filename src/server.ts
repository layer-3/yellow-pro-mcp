import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { clientFromEnv, type YellowProClient } from "./client.js";
import { registerAccountTools } from "./server/account-tools.js";
import { registerHistoryTools } from "./server/history-tools.js";
import { registerMarketTools } from "./server/market-tools.js";
import { registerTradingTools } from "./server/trading-tools.js";
import { VERSION } from "./version.js";

export type Module = "market" | "account" | "trading";
export const ALL_MODULES: Module[] = ["market", "account", "trading"];

export interface ServerConfig {
  readonly client: YellowProClient;
  readonly enableTrading: boolean;
  readonly modules: Module[];
}

const SERVER_INSTRUCTIONS = [
  "yellow_pro exchange. Use native market ids such as ETHUSDT and BTCUSDT-PERP.",
  "Call get_markets first to confirm market ids, precision, limits, leverage caps, and position modes before trading.",
  "Order amounts are decimal strings in the market's base asset; prices are decimal strings in the quote asset. Label the base asset when confirming an order.",
  "Spot and Perpetual balances are separate. Check balances, open orders, and positions before state-changing actions; transfer funds explicitly when needed.",
  "API-key scopes can change in the Yellow Pro UI without reconnecting. Call get_api_key_permissions before deciding credentials are read-only, before trading, and whenever the user says permissions changed. The exchange enforces the returned live scopes.",
  "For tests, prefer small post_only or limit orders that rest on the book, then verify open orders and cancel/cleanup. Do not place market orders or close positions unless the user explicitly asks or confirms.",
  "For Perpetuals, HEDGE mode uses direction long or short. ONE_WAY mode requires direction both. Never infer both unless get_perpetual_accounts or get_markets confirms ONE_WAY mode.",
  "Market data is public; account and trading tools require credentials.",
].join(" ");

function parseModule(value: string): Module | undefined {
  switch (value) {
    case "market":
    case "account":
    case "trading":
      return value;
    default:
      return undefined;
  }
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const modules = env.YELLOW_PRO_MODULES
    ? env.YELLOW_PRO_MODULES
      .split(",")
      .map((module) => parseModule(module.trim()))
      .filter((module): module is Module => module !== undefined)
    : ALL_MODULES;
  return {
    client: clientFromEnv(env),
    enableTrading: (env.YELLOW_PRO_ENABLE_TRADING ?? "").toLowerCase() === "true",
    modules,
  };
}

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer(
    { name: "yellow_pro", version: VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  if (config.modules.includes("market")) {
    registerMarketTools(server, config.client);
  }
  if (config.modules.includes("account")) {
    registerAccountTools(server, config.client);
    registerHistoryTools(server, config.client);
  }
  if (config.modules.includes("trading") && config.enableTrading) {
    registerTradingTools(server, config.client);
  }
  return server;
}

export async function main(): Promise<void> {
  await createServer(configFromEnv()).connect(new StdioServerTransport());
}

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
    {
      instructions:
        "yellow_pro exchange. Use native market ids such as ETHUSDT and BTCUSDT-PERP. " +
        "Call get_markets first. Amounts and prices are decimal strings. " +
        "Market data is public; account and trading tools require credentials.",
    },
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

/** Tool registration: read-only by default, trading gate, module filtering. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { YellowProClient } from "../src/client.js";
import { ALL_MODULES, createServer, Module } from "../src/server.js";

const MARKET_TOOLS = [
  "get_health", "get_markets", "get_ticker", "get_orderbook", "get_klines",
  "get_funding_rate", "get_funding_rate_history",
];
const ACCOUNT_TOOLS = [
  "get_balance", "get_open_orders", "get_order_history", "get_my_trades", "get_positions",
  "get_position_history", "get_position_mode", "get_fee_schedule", "get_funding_payments",
];
const TRADING_TOOLS = [
  "place_order", "cancel_order", "cancel_orders",
  "set_leverage", "set_position_mode", "transfer",
];

async function toolNames(enableTrading: boolean, modules: Module[] = ALL_MODULES): Promise<Set<string>> {
  const server = createServer({ client: new YellowProClient(), enableTrading, modules });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  const { tools } = await mcpClient.listTools();
  await mcpClient.close();
  await server.close();
  return new Set(tools.map((tool) => tool.name));
}

test("read-only by default", async () => {
  const names = await toolNames(false);
  assert.deepEqual(names, new Set([...MARKET_TOOLS, ...ACCOUNT_TOOLS]));
});

test("trading tools appear when enabled", async () => {
  const names = await toolNames(true);
  assert.deepEqual(names, new Set([...MARKET_TOOLS, ...ACCOUNT_TOOLS, ...TRADING_TOOLS]));
});

test("module filtering", async () => {
  const names = await toolNames(true, ["market"]);
  assert.deepEqual(names, new Set(MARKET_TOOLS));
});

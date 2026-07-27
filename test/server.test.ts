/** Tool registration: read-only by default, trading gate, module filtering. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { YellowProClient } from "../src/client.js";
import { ALL_MODULES, configFromEnv, createServer } from "../src/server.js";
import type { Module } from "../src/server.js";

const MARKET_TOOLS = [
  "get_health", "get_markets", "get_ticker", "get_orderbook", "get_klines",
  "get_funding_rate", "get_funding_rate_history", "get_networks", "get_transfer_assets",
];
const ACCOUNT_TOOLS = [
  "get_balance", "get_open_orders", "get_order_history", "get_my_trades", "get_positions",
  "get_position_history", "get_perpetual_accounts", "get_fee_schedule", "get_funding_payments",
  "get_spot_accounts", "get_spot_account", "get_position_history_detail", "get_fee_tier",
  "get_market_fee_rate", "get_transaction_history",
];
const TRADING_TOOLS = [
  "place_order", "cancel_order", "cancel_all_orders", "close_positions", "set_leverage", "transfer",
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

async function toolSchema(name: string): Promise<Record<string, unknown>> {
  const server = createServer({ client: new YellowProClient(), enableTrading: true, modules: ALL_MODULES });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  const { tools } = await mcpClient.listTools();
  await mcpClient.close();
  await server.close();
  return tools.find((tool) => tool.name === name)?.inputSchema as Record<string, unknown>;
}

test("read-only by default", async () => {
  const names = await toolNames(false);
  assert.deepEqual(names, new Set([...MARKET_TOOLS, ...ACCOUNT_TOOLS]));
});

test("trading tools appear when enabled", async () => {
  const names = await toolNames(true);
  assert.deepEqual(names, new Set([...MARKET_TOOLS, ...ACCOUNT_TOOLS, ...TRADING_TOOLS]));
});

test("trading gate only accepts literal true", () => {
  assert.equal(configFromEnv({ YELLOW_PRO_ENABLE_TRADING: "yes" }).enableTrading, false);
  assert.equal(configFromEnv({ YELLOW_PRO_ENABLE_TRADING: "1" }).enableTrading, false);
  assert.equal(configFromEnv({ YELLOW_PRO_ENABLE_TRADING: "TRUE" }).enableTrading, true);
});

test("place_order exposes post-only and conditional order parameters", async () => {
  const schema = await toolSchema("place_order");
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual((properties.order_type as { enum: string[] }).enum, [
    "limit", "market", "post_only", "trigger_limit", "trigger_market",
  ]);
  assert.equal(properties.trigger_price.type, "string");
  assert.deepEqual((properties.trigger_type as { enum: string[] }).enum, ["stop_loss", "take_profit"]);
  assert.deepEqual((properties.direction as { enum: string[] }).enum, ["long", "short", "both"]);
  assert.equal(properties.client_order_id.type, "string");
});

test("cancel_order accepts request and readback conditional types", async () => {
  const schema = await toolSchema("cancel_order");
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual((properties.order_type as { enum: string[] }).enum, [
    "limit", "market", "post_only", "trigger_limit", "trigger_market",
    "stop_limit", "stop_market", "stop_loss", "take_limit", "take_market", "take_profit",
  ]);
});

test("paginated tools expose opaque cursors instead of page numbers", async () => {
  const schema = await toolSchema("get_open_orders");
  const properties = schema.properties as Record<string, Record<string, unknown>>;

  assert.equal(properties.cursor.type, "string");
  assert.equal(properties.page, undefined);
  assert.equal(properties.page_size.minimum, 1);
  assert.equal(properties.page_size.maximum, 100);
});

test("funding rate and klines expose the staging-supported fields", async () => {
  const fundingSchema = await toolSchema("get_funding_rate");
  const klinesSchema = await toolSchema("get_klines");
  const orderbookSchema = await toolSchema("get_orderbook");
  const fundingRequired = fundingSchema.required as string[];
  const klineProperties = klinesSchema.properties as Record<string, Record<string, unknown>>;
  const orderbookProperties = orderbookSchema.properties as Record<string, Record<string, unknown>>;

  assert.equal(fundingRequired.includes("market"), true);
  assert.equal(klineProperties.end_time.type, "integer");
  assert.equal(klineProperties.time_zone, undefined);
  assert.equal(orderbookProperties.limit, undefined);
});

test("account tools expose documented filters and detail pagination", async () => {
  const spotSchema = await toolSchema("get_spot_account");
  const positionSchema = await toolSchema("get_position_history");
  const detailSchema = await toolSchema("get_position_history_detail");
  const transactionSchema = await toolSchema("get_transaction_history");
  const spotProperties = spotSchema.properties as Record<string, Record<string, unknown>>;
  const positionProperties = positionSchema.properties as Record<string, Record<string, unknown>>;
  const detailProperties = detailSchema.properties as Record<string, Record<string, unknown>>;
  const transactionProperties = transactionSchema.properties as Record<string, Record<string, unknown>>;

  assert.equal(spotProperties.asset.type, "string");
  assert.equal(spotProperties.asset_like.type, "string");
  assert.deepEqual((positionProperties.sort_by as { enum: string[] }).enum, ["opened_at", "closed_at"]);
  assert.deepEqual((positionProperties.sort_dir as { enum: string[] }).enum, ["asc", "desc"]);
  assert.equal(detailProperties.page_size.maximum, 500);
  assert.deepEqual((transactionProperties.type as { enum: string[] }).enum, [
    "funding_fee", "transfer", "fee", "realized_pnl", "liquidation", "adl",
  ]);
});

test("module filtering", async () => {
  const names = await toolNames(true, ["market"]);
  assert.deepEqual(names, new Set(MARKET_TOOLS));
});

/** Request construction must match the reference implementation (ccxt_cpp ts/src/neodax.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "../src/api.js";
import { clientFromEnv } from "../src/client.js";
import type { Params, YellowProClient } from "../src/client.js";
import { configFromEnv } from "../src/server.js";

interface Call {
  method: string;
  path: string;
  params: Params;
}

function stubClient(): { client: YellowProClient; calls: Call[] } {
  const calls: Call[] = [];
  const record = async (method: string, path: string, params: Params = {}) => {
    calls.push({ method, path, params });
    return {};
  };
  return { client: { public: record, private: record } as unknown as YellowProClient, calls };
}

test("market order does not send price", async () => {
  const { client, calls } = stubClient();
  await api.placeOrder(client, "perp", {
    market: "BTCUSDT-PERP", side: "buy", order_type: "market", amount: "0.001", price: "50000",
  });
  assert.equal(calls[0].path, "perpetual/order");
  assert.equal("price" in calls[0].params, false);
  assert.equal(calls[0].params.time_in_force, "ioc");
});

test("perp single order shape matches reference", async () => {
  const { client, calls } = stubClient();
  await api.placeOrder(client, "perp", {
    market: "BTCUSDT-PERP", side: "buy", order_type: "limit", amount: "0.001", price: "52000",
  });
  const body = calls[0].params;
  assert.equal(body.direction, "long");
  assert.equal(body.leverage, "1");
  assert.equal(body.margin_mode, "cross");
  assert.equal(body.time_in_force, "gtc");
  assert.equal(body.price, "52000");
});

test("spot cancel includes type", async () => {
  const { client, calls } = stubClient();
  await api.cancelOrder(client, "spot", "BTCYTEST.USD", "uuid-1");
  assert.equal(calls[0].method, "DELETE");
  assert.deepEqual(calls[0].params, { order_uuid: "uuid-1", market: "BTCYTEST.USD", type: "limit" });
});

test("fee schedule and position funding match the staging OpenAPI", async () => {
  const { client, calls } = stubClient();
  await api.feeSchedule(client);
  await api.fundingPayments(client, "position", "position-1", { page: 2 });

  assert.equal(calls[0].path, "account/fee-schedule");
  assert.equal(calls[1].path, "perpetual/position/funding-payments");
  assert.deepEqual(calls[1].params, { position_id: "position-1", page: 2 });
});

test("empty cancel batches are rejected locally", () => {
  const { client } = stubClient();
  assert.throws(() => api.cancelOrders(client, "perp", "BTCUSDT-PERP", []), /must not be empty/);
});

test("trading gate only accepts literal true", () => {
  assert.equal(configFromEnv({ YELLOW_PRO_ENABLE_TRADING: "yes" } as NodeJS.ProcessEnv).enableTrading, false);
  assert.equal(configFromEnv({ YELLOW_PRO_ENABLE_TRADING: "1" } as NodeJS.ProcessEnv).enableTrading, false);
  assert.equal(configFromEnv({ YELLOW_PRO_ENABLE_TRADING: "TRUE" } as NodeJS.ProcessEnv).enableTrading, true);
});

test("sandbox mode selects staging URL unless base URL is explicit", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    await clientFromEnv({
      YELLOW_PRO_SANDBOX: "true",
      YELLOW_PRO_RATE_LIMIT_MS: "0",
    }).public("GET", "health");
    await clientFromEnv({
      YELLOW_PRO_SANDBOX: "true",
      YELLOW_PRO_BASE_URL: "https://override.example",
      YELLOW_PRO_RATE_LIMIT_MS: "0",
    }).public("GET", "health");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(urls, [
    "https://api.uat.yellow.pro.neodax.app/health",
    "https://override.example/health",
  ]);
});

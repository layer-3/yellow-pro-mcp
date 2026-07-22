/** Request construction must match the reference implementation (ccxt_cpp ts/src/neodax.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "../src/api.js";
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

test("perp batch omits margin_mode, spot cancel includes type", async () => {
  const { client, calls } = stubClient();
  await api.placeOrders(client, "perp", [
    { market: "BTCUSDT-PERP", side: "sell", order_type: "limit", amount: "1", price: "9", post_only: true },
  ]);
  const op = (calls[0].params.operations as Params[])[0];
  assert.equal(op.operation, "create");
  assert.equal(op.type, "post_only");
  assert.equal("margin_mode" in op, false);

  await api.cancelOrder(client, "spot", "BTCYTEST.USD", "uuid-1");
  assert.equal(calls[1].method, "DELETE");
  assert.deepEqual(calls[1].params, { order_uuid: "uuid-1", market: "BTCYTEST.USD", type: "limit" });
});

test("empty batches are rejected locally", () => {
  const { client } = stubClient();
  assert.throws(() => api.placeOrders(client, "spot", []), /must not be empty/);
  assert.throws(() => api.cancelOrders(client, "perp", "BTCUSDT-PERP", []), /must not be empty/);
});

test("trading gate only accepts literal true", () => {
  assert.equal(configFromEnv({ YELLOW_PRO_ENABLE_TRADING: "yes" } as NodeJS.ProcessEnv).enableTrading, false);
  assert.equal(configFromEnv({ YELLOW_PRO_ENABLE_TRADING: "1" } as NodeJS.ProcessEnv).enableTrading, false);
  assert.equal(configFromEnv({ YELLOW_PRO_ENABLE_TRADING: "TRUE" } as NodeJS.ProcessEnv).enableTrading, true);
});

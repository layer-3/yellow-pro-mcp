import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "../src/api.js";
import { type Params, YellowProClient } from "../src/client.js";

interface Call {
  readonly visibility: "public" | "private";
  readonly method: string;
  readonly path: string;
  readonly params: Params;
}

class StubClient extends YellowProClient {
  readonly calls: Call[] = [];

  override async public(method: string, path: string, params: Params = {}): Promise<unknown> {
    this.calls.push({ visibility: "public", method, path, params });
    return {};
  }

  override async private(method: string, path: string, params: Params = {}): Promise<unknown> {
    this.calls.push({ visibility: "private", method, path, params });
    return {};
  }
}

function stubClient(): { client: YellowProClient; calls: Call[] } {
  const client = new StubClient();
  return { client, calls: client.calls };
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

test("orderbook sends only the market symbol", async () => {
  const { client, calls } = stubClient();
  await api.orderbook(client, "ETHUSDT");

  assert.deepEqual(calls[0].params, { symbol: "ETHUSDT" });
});

test("perp single order shape matches reference", async () => {
  const { client, calls } = stubClient();
  await api.placeOrder(client, "perp", {
    market: "BTCUSDT-PERP", side: "buy", order_type: "limit", amount: "0.001", price: "52000",
  });
  const body = calls[0].params;
  assert.equal(body.direction, "long");
  assert.equal(body.leverage, "1");
  assert.equal("margin_mode" in body, false);
  assert.equal(body.time_in_force, "gtc");
  assert.equal(body.price, "52000");
});

test("spot and perp post-only orders preserve the exchange order type", async () => {
  const { client, calls } = stubClient();
  await api.placeOrder(client, "spot", {
    market: "ETHUSDT", side: "buy", order_type: "post_only", amount: "0.01", price: "1800",
  });
  await api.placeOrder(client, "perp", {
    market: "ETHUSDT-PERP", side: "sell", order_type: "post_only", amount: "0.01", price: "2100",
  });

  assert.equal(calls[0].params.type, "post_only");
  assert.equal(calls[0].params.price, "1800");
  assert.equal(calls[0].params.time_in_force, "gtc");
  assert.equal(calls[1].params.type, "post_only");
  assert.equal(calls[1].params.price, "2100");
  assert.equal(calls[1].params.time_in_force, "gtc");
});

test("conditional order shapes match the Spot and Perpetual APIs", async () => {
  const { client, calls } = stubClient();
  await api.placeOrder(client, "spot", {
    market: "ETHUSDT",
    side: "buy",
    order_type: "trigger_limit",
    amount: "0.01",
    price: "2050",
    trigger_price: "2000",
  });
  await api.placeOrder(client, "perp", {
    market: "ETHUSDT-PERP",
    side: "sell",
    order_type: "trigger_market",
    amount: "0.01",
    trigger_price: "1800",
    trigger_type: "stop_loss",
  });

  assert.deepEqual(calls[0].params, {
    market: "ETHUSDT",
    side: "buy",
    type: "trigger_limit",
    amount: "0.01",
    price: "2050",
    trigger_price: "2000",
    time_in_force: "gtc",
  });
  assert.equal(calls[1].params.type, "trigger_market");
  assert.equal(calls[1].params.trigger_price, "1800");
  assert.equal(calls[1].params.trigger_type, "stop_loss");
  assert.equal(calls[1].params.time_in_force, "ioc");
  assert.equal("price" in calls[1].params, false);
});

test("conditional and post-only orders enforce their required prices", () => {
  const { client } = stubClient();
  assert.throws(
    () => api.placeOrder(client, "spot", {
      market: "ETHUSDT", side: "buy", order_type: "post_only", amount: "0.01",
    }),
    /post_only orders require a price/,
  );
  assert.throws(
    () => api.placeOrder(client, "spot", {
      market: "ETHUSDT", side: "buy", order_type: "trigger_limit", amount: "0.01", price: "2000",
    }),
    /trigger_limit orders require trigger_price/,
  );
  assert.throws(
    () => api.placeOrder(client, "perp", {
      market: "ETHUSDT-PERP", side: "sell", order_type: "trigger_market", amount: "0.01",
    }),
    /trigger_market orders require trigger_price/,
  );
});

test("spot cancel includes type", async () => {
  const { client, calls } = stubClient();
  await api.cancelOrder(client, "spot", {
    market: "BTCYTEST.USD",
    order_id: "uuid-1",
    order_type: "post_only",
  });
  assert.equal(calls[0].method, "DELETE");
  assert.deepEqual(calls[0].params, { order_uuid: "uuid-1", market: "BTCYTEST.USD", type: "post_only" });
});

test("spot cancel normalizes conditional request types to their readback types", async () => {
  const { client, calls } = stubClient();
  await api.cancelOrder(client, "spot", {
    market: "ETHUSDT", order_id: "uuid-2", order_type: "trigger_limit",
  });
  await api.cancelOrder(client, "spot", {
    market: "ETHUSDT", order_id: "uuid-3", order_type: "trigger_market",
  });
  await api.cancelOrder(client, "spot", {
    market: "ETHUSDT", order_id: "uuid-4", order_type: "stop_loss",
  });
  assert.equal(calls[0].params.type, "stop_limit");
  assert.equal(calls[1].params.type, "stop_market");
  assert.equal(calls[2].params.type, "stop_loss");
});

test("klines send the staging-supported query", async () => {
  const { client, calls } = stubClient();
  await api.klines(client, "BTCUSDT", {
    interval: "1h",
    start_time: 1_700_000_000_000,
    end_time: 1_700_003_600_000,
    limit: 24,
  });

  assert.deepEqual(calls[0].params, {
    symbol: "BTCUSDT",
    interval: "1h",
    startTime: 1_700_000_000_000,
    endTime: 1_700_003_600_000,
    limit: 24,
  });
});

test("fee schedule is public and perpetual accounts use the documented route", async () => {
  const { client, calls } = stubClient();
  await api.feeSchedule(client);
  await api.perpetualAccounts(client);

  assert.equal(calls[0].visibility, "public");
  assert.equal(calls[0].path, "account/fee-schedule");
  assert.equal(calls[1].visibility, "private");
  assert.equal(calls[1].path, "perpetual/accounts");
});

test("current funding rate requires one market route", async () => {
  const { client, calls } = stubClient();
  await api.fundingRate(client, "BTCUSDT-PERP");

  assert.equal(calls[0].visibility, "public");
  assert.equal(calls[0].path, "perpetual/funding-rate/BTCUSDT-PERP");
});

test("cursor pagination starts explicitly and follows opaque continuation tokens", async () => {
  const { client, calls } = stubClient();
  await api.fundingRateHistory(client, "BTCUSDT-PERP", { page_size: 20 });
  await api.openOrders(client, "spot", {
    market: "BTCUSDT",
    cursor: "opaque-next-page",
    page_size: 20,
  });

  assert.deepEqual(calls[0].params, {
    symbol: "BTCUSDT-PERP",
    use_cursor: true,
    page_size: 20,
  });
  assert.deepEqual(calls[1].params, {
    market: "BTCUSDT",
    cursor: "opaque-next-page",
    page_size: 20,
  });
});

test("position funding payments use cursor pagination", async () => {
  const { client, calls } = stubClient();
  await api.fundingPayments(client, {
    scope: "position",
    position_id: "position-1",
    page_size: 50,
  });

  assert.equal(calls[0].path, "perpetual/position/funding-payments");
  assert.deepEqual(calls[0].params, {
    position_id: "position-1",
    use_cursor: true,
    page_size: 50,
  });
});

test("cancel all orders uses the documented DELETE route with an optional market", async () => {
  const { client, calls } = stubClient();
  await api.cancelAllOrders(client, "spot", "BTCUSDT");
  await api.cancelAllOrders(client, "perp");

  assert.deepEqual(calls[0], {
    visibility: "private",
    method: "DELETE",
    path: "spot/orders",
    params: { market: "BTCUSDT" },
  });
  assert.deepEqual(calls[1], {
    visibility: "private",
    method: "DELETE",
    path: "perpetual/orders",
    params: {},
  });
});

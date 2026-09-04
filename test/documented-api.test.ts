import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "../src/api.js";
import { Params, YellowProClient } from "../src/client.js";

interface RecordedCall {
  readonly visibility: "public" | "private";
  readonly method: string;
  readonly path: string;
  readonly params: Params;
}

class RecordingClient extends YellowProClient {
  readonly calls: RecordedCall[] = [];

  override async public(method: string, path: string, params: Params = {}): Promise<unknown> {
    this.calls.push({ visibility: "public", method, path, params });
    return {};
  }

  override async private(method: string, path: string, params: Params = {}): Promise<unknown> {
    this.calls.push({ visibility: "private", method, path, params });
    return {};
  }
}

test("documented public data endpoints use their exact routes", async () => {
  const client = new RecordingClient();

  await api.networks(client);
  await api.transferAssets(client);

  assert.deepEqual(
    client.calls.map(({ visibility, method, path }) => ({ visibility, method, path })),
    [
      { visibility: "public", method: "GET", path: "spot/networks" },
      { visibility: "public", method: "GET", path: "perpetual/transfer-assets" },
    ],
  );
});

test("documented account and fee endpoints preserve filters and authentication", async () => {
  const client = new RecordingClient();

  await api.apiKeyPermissions(client);
  await api.spotAccounts(client);
  await api.spotAccount(client, { asset: "USDT", asset_like: "usd" });
  await api.feeTier(client);
  await api.marketFeeRate(client, "spot", "BTCUSDT");
  await api.marketFeeRate(client, "perp", "BTCUSDT-PERP");

  assert.deepEqual(client.calls, [
    { visibility: "private", method: "GET", path: "accounts/api-key/permissions", params: {} },
    { visibility: "private", method: "GET", path: "spot/accounts", params: {} },
    {
      visibility: "private",
      method: "GET",
      path: "spot/account",
      params: { asset: "USDT", asset_like: "usd" },
    },
    { visibility: "private", method: "GET", path: "account/fee-tier", params: {} },
    {
      visibility: "private",
      method: "GET",
      path: "spot/account/market-fee-rate",
      params: { market: "BTCUSDT" },
    },
    {
      visibility: "private",
      method: "GET",
      path: "perpetual/account/market-fee-rate",
      params: { market: "BTCUSDT-PERP" },
    },
  ]);
});

test("documented history filters and cursors are forwarded without translation", async () => {
  const client = new RecordingClient();

  await api.openOrders(client, "spot", { asset: "USDT", market: "BTCUSDT", page_size: 20 });
  await api.orderHistory(client, "perp", { market_like: "BTC", cursor: "orders-next" });
  await api.myTrades(client, "perp", {
    market_like: "ETH",
    start_time: "2026-07-01T00:00:00Z",
    end_time: "2026-07-02T00:00:00Z",
  });
  await api.positionHistory(client, {
    market: "BTCUSDT-PERP",
    opened_from: "2026-07-01T00:00:00Z",
    closed_to: "2026-07-02T00:00:00Z",
    sort_by: "closed_at",
    sort_dir: "desc",
  });
  await api.fundingPayments(client, {
    scope: "account",
    interval_start: "2026-07-01T00:00:00Z",
  });

  assert.deepEqual(client.calls.map(({ params }) => params), [
    { asset: "USDT", market: "BTCUSDT", use_cursor: true, page_size: 20 },
    { market_like: "BTC", cursor: "orders-next" },
    {
      market_like: "ETH",
      start_time: "2026-07-01T00:00:00Z",
      end_time: "2026-07-02T00:00:00Z",
      use_cursor: true,
    },
    {
      market: "BTCUSDT-PERP",
      opened_from: "2026-07-01T00:00:00Z",
      closed_to: "2026-07-02T00:00:00Z",
      sort_by: "closed_at",
      sort_dir: "desc",
      use_cursor: true,
    },
    { interval_start: "2026-07-01T00:00:00Z", use_cursor: true },
  ]);
});

test("perpetual history detail and transactions use their documented pagination", async () => {
  const client = new RecordingClient();

  await api.positionHistoryDetail(client, "position-1", { cursor: "fills-next", page_size: 200 });
  await api.transactionHistory(client, {
    type: "funding_fee",
    market: "BTCUSDT-PERP",
    asset: "USDT",
    start_time: 1_720_000_000,
    end_time: 1_720_086_400,
    page_size: 50,
  });

  assert.deepEqual(client.calls[0], {
    visibility: "private",
    method: "GET",
    path: "perpetual/position-history/position-1",
    params: { cursor: "fills-next", page_size: 200 },
  });
  assert.deepEqual(client.calls[1], {
    visibility: "private",
    method: "GET",
    path: "perpetual/transaction/history",
    params: {
      type: "funding_fee",
      market: "BTCUSDT-PERP",
      asset: "USDT",
      start_time: 1_720_000_000,
      end_time: 1_720_086_400,
      use_cursor: true,
      page_size: 50,
    },
  });
});

test("perpetual close and client order id use documented request bodies", async () => {
  const client = new RecordingClient();

  await api.closePositions(client, "BTCUSDT-PERP");
  await api.placeOrder(client, "perp", {
    market: "BTCUSDT-PERP",
    side: "buy",
    direction: "long",
    order_type: "limit",
    amount: "0.001",
    price: "50000",
    client_order_id: "agent-order-1",
  });

  assert.deepEqual(client.calls[0], {
    visibility: "private",
    method: "POST",
    path: "perpetual/positions/close",
    params: { market: "BTCUSDT-PERP" },
  });
  assert.equal(client.calls[1].params.client_order_id, "agent-order-1");
});

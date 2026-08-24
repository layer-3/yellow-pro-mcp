#!/usr/bin/env node
import { parseArgs } from "node:util";
import { api, type OrderInput } from "./api.js";
import { clientFromEnv, YellowProError } from "./client.js";
import { connect, connectionStatus, disconnect } from "./onboarding.js";
import {
  asMarketType,
  num,
  oneOf,
  req,
  setup,
  tradingEnabled,
  USAGE,
} from "./cli/support.js";
import { VERSION } from "./version.js";

async function run(): Promise<unknown> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: "string" },
      interval: { type: "string" },
      start: { type: "string" },
      end: { type: "string" },
      cursor: { type: "string" },
      "page-size": { type: "string" },
      market: { type: "string" },
      "market-like": { type: "string" },
      asset: { type: "string" },
      "asset-like": { type: "string" },
      "position-id": { type: "string" },
      scope: { type: "string" },
      "interval-start": { type: "string" },
      "opened-from": { type: "string" },
      "opened-to": { type: "string" },
      "closed-from": { type: "string" },
      "closed-to": { type: "string" },
      "sort-by": { type: "string" },
      "sort-dir": { type: "string" },
      type: { type: "string" },
      tif: { type: "string" },
      "reduce-only": { type: "boolean" },
      leverage: { type: "string" },
      direction: { type: "string" },
      "order-type": { type: "string" },
      "trigger-price": { type: "string" },
      "trigger-type": { type: "string" },
      "client-order-id": { type: "string" },
      code: { type: "string" },
      client: { type: "string" },
      "auth-url": { type: "string" },
      "api-url": { type: "string" },
      replace: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const [command, ...args] = positionals;
  if (values.version) {
    return VERSION;
  }
  if (values.help || command === undefined || command === "help") {
    return USAGE;
  }
  if (command === "connect") {
    return connect({
      code: req(values.code ?? args[0], "pairing-code"),
      client: values.client ?? "claude-code",
      authUrl: values["auth-url"],
      apiUrl: values["api-url"],
      replace: values.replace ?? false,
    });
  }
  if (command === "status") {
    return connectionStatus();
  }
  if (command === "disconnect") {
    return disconnect();
  }
  const client = clientFromEnv();
  const cursorQuery = { cursor: values.cursor, page_size: num(values["page-size"]) };
  switch (command) {
    case "health": return api.health(client);
    case "markets":
      return api.markets(client, args[0] === undefined
        ? "all"
        : oneOf(args[0], "market-type", ["spot", "perp", "all"] as const));
    case "ticker": return api.ticker(client, req(args[0], "market"));
    case "orderbook": return api.orderbook(client, req(args[0], "market"));
    case "klines":
      return api.klines(client, req(args[0], "market"), {
        interval: values.interval,
        start_time: num(values.start),
        end_time: num(values.end),
        limit: num(values.limit),
      });
    case "funding": return api.fundingRate(client, req(args[0], "market"));
    case "funding-history": return api.fundingRateHistory(client, args[0], cursorQuery);
    case "networks": return api.networks(client);
    case "transfer-assets": return api.transferAssets(client);
    case "balance":
      return api.balance(client, asMarketType(args[0]), {
        asset: values.asset,
        asset_like: values["asset-like"],
      });
    case "spot-accounts": return api.spotAccounts(client);
    case "spot-account":
      return api.spotAccount(client, { asset: values.asset, asset_like: values["asset-like"] });
    case "open-orders":
      return api.openOrders(client, asMarketType(args[0]), {
        market: values.market,
        asset: values.asset,
        market_like: values["market-like"],
        ...cursorQuery,
      });
    case "orders":
      return api.orderHistory(client, asMarketType(args[0]), {
        market: values.market,
        market_like: values["market-like"],
        ...cursorQuery,
      });
    case "trades":
      return api.myTrades(client, asMarketType(args[0]), {
        market: values.market,
        market_like: values["market-like"],
        start_time: values.start,
        end_time: values.end,
        ...cursorQuery,
      });
    case "positions": return api.positions(client);
    case "position-history":
      return api.positionHistory(client, {
        market: values.market,
        opened_from: values["opened-from"],
        opened_to: values["opened-to"],
        closed_from: values["closed-from"],
        closed_to: values["closed-to"],
        sort_by: values["sort-by"] === undefined
          ? undefined
          : oneOf(values["sort-by"], "sort-by", ["opened_at", "closed_at"] as const),
        sort_dir: values["sort-dir"] === undefined
          ? undefined
          : oneOf(values["sort-dir"], "sort-dir", ["asc", "desc"] as const),
        ...cursorQuery,
      });
    case "position-history-detail":
      return api.positionHistoryDetail(client, req(args[0], "position_id"), cursorQuery);
    case "perpetual-accounts": return api.perpetualAccounts(client);
    case "fee-schedule": return api.feeSchedule(client);
    case "fee-tier": return api.feeTier(client);
    case "market-fee-rate":
      return api.marketFeeRate(client, asMarketType(args[0]), req(args[1], "market"));
    case "transactions":
      return api.transactionHistory(client, {
        type: values.type === undefined
          ? undefined
          : oneOf(values.type, "type", [
            "funding_fee", "transfer", "fee", "realized_pnl", "liquidation", "adl",
          ] as const),
        market: values.market,
        asset: values.asset,
        start_time: num(values.start),
        end_time: num(values.end),
        ...cursorQuery,
      });
    case "funding-payments":
      return api.fundingPayments(client, {
        scope: values.scope === undefined
          ? "account"
          : oneOf(values.scope, "scope", ["account", "position"] as const),
        position_id: values["position-id"],
        interval_start: values["interval-start"],
        ...cursorQuery,
      });
    case "place": {
      tradingEnabled();
      const order: OrderInput = {
        market: req(args[1], "market"),
        side: oneOf(args[2], "side", ["buy", "sell"] as const),
        order_type: oneOf(args[3], "order-type", [
          "limit", "market", "post_only", "trigger_limit", "trigger_market",
        ] as const),
        amount: req(args[4], "amount"),
        price: args[5],
        trigger_price: values["trigger-price"],
        trigger_type: values["trigger-type"] === undefined
          ? undefined
          : oneOf(values["trigger-type"], "trigger-type", ["stop_loss", "take_profit"] as const),
        time_in_force: values.tif,
        reduce_only: values["reduce-only"],
        leverage: values.leverage,
        direction: values.direction === undefined
          ? undefined
          : oneOf(values.direction, "direction", ["long", "short", "both"] as const),
        client_order_id: values["client-order-id"],
      };
      return api.placeOrder(client, asMarketType(args[0]), order);
    }
    case "cancel":
      tradingEnabled();
      return api.cancelOrder(client, asMarketType(args[0]), {
        market: req(args[1], "market"),
        order_id: req(args[2], "order_uuid"),
        order_type: values["order-type"] === undefined
          ? "limit"
          : oneOf(values["order-type"], "order-type", [
            "limit", "market", "post_only", "trigger_limit", "trigger_market",
            "stop_limit", "stop_market", "stop_loss", "take_limit", "take_market", "take_profit",
          ] as const),
      });
    case "cancel-all":
      tradingEnabled();
      return api.cancelAllOrders(client, asMarketType(args[0]), values.market);
    case "close-positions":
      tradingEnabled();
      return api.closePositions(client, values.market);
    case "set-leverage":
      tradingEnabled();
      return api.setLeverage(client, req(args[0], "market"), req(args[1], "leverage"));
    case "transfer":
      tradingEnabled();
      return api.transfer(client, {
        asset: req(args[0], "asset"),
        amount: req(args[1], "amount"),
        from_account: oneOf(args[2], "from", ["spot", "perps"] as const),
        to_account: oneOf(args[3], "to", ["spot", "perps"] as const),
      });
    case "setup": return setup(args[0]);
    default: throw new YellowProError(`unknown command '${command}' — run yellow-pro --help`);
  }
}

run()
  .then((result) => console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error instanceof YellowProError ? `error: ${error.message}` : error);
    process.exit(1);
  });

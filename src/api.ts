/**
 * yellow_pro API surface shared by the MCP server and the CLI.
 * Request shapes mirror the reference CCXT implementation (ccxt_cpp ts/src/neodax.ts).
 * Responses are returned raw — callers (AI agents) read the exchange JSON directly.
 */
import { Params, YellowProClient, YellowProError } from "./client.js";

export const PREFIX = { spot: "spot", perp: "perpetual" } as const;
export type MarketType = keyof typeof PREFIX;

export interface OrderInput {
  market: string;
  side: "buy" | "sell";
  order_type: "limit" | "market";
  amount: string;
  price?: string;
  time_in_force?: string;
  post_only?: boolean;
  reduce_only?: boolean;
  leverage?: string;
  direction?: "long" | "short" | "both";
  client_order_id?: string;
}

export interface PageQuery {
  page?: number;
  page_size?: number;
}

function resolveType(order: OrderInput): string {
  return order.post_only ? "post_only" : order.order_type;
}

function resolveTimeInForce(type: string, timeInForce?: string): string {
  return (timeInForce ?? (type === "market" ? "ioc" : "gtc")).toLowerCase();
}

function resolveDirection(order: OrderInput): string {
  if (order.direction) {
    return order.direction;
  }
  if (order.reduce_only) {
    return order.side === "buy" ? "short" : "long";
  }
  return order.side === "buy" ? "long" : "short";
}

function requirePrice(order: OrderInput, type: string): void {
  if (type !== "market" && order.price === undefined) {
    throw new YellowProError(`${type} orders require a price`);
  }
}

export const api = {
  health: (c: YellowProClient) => c.public("GET", "health"),

  markets: async (c: YellowProClient, marketType: "spot" | "perp" | "all" = "all") => {
    const result: Params = {};
    if (marketType !== "perp") {
      result.spot = await c.public("GET", "spot/exchangeInfo");
    }
    if (marketType !== "spot") {
      try {
        result.perp = await c.public("GET", "perpetual/exchangeInfo");
      } catch (error) {
        // perpetual may be unavailable, degrade to spot-only
        result.perp = { unavailable: String(error) };
      }
    }
    return result;
  },

  ticker: (c: YellowProClient, market: string) => c.public("GET", "ticker/24hr", { symbol: market }),

  orderbook: (c: YellowProClient, market: string, limit?: number) =>
    c.public("GET", "orderbook", { symbol: market, limit }),

  klines: (c: YellowProClient, market: string, interval = "1m", startTime?: number, limit?: number) =>
    c.public("GET", "klines", { symbol: market, interval, startTime, limit }),

  fundingRate: (c: YellowProClient, market?: string) =>
    market
      ? c.public("GET", `perpetual/funding-rate/${market}`)
      : c.public("GET", "perpetual/funding-rates"),

  fundingRateHistory: (c: YellowProClient, market?: string, query: PageQuery = {}) =>
    c.public("GET", "perpetual/funding-rates", { symbol: market, ...query }),

  balance: (c: YellowProClient, marketType: MarketType) =>
    c.private("GET", marketType === "spot" ? "spot/account" : "perpetual/balance"),

  openOrders: (c: YellowProClient, marketType: MarketType, market?: string, query: PageQuery = {}) =>
    c.private("GET", `${PREFIX[marketType]}/open_orders`, { market, ...query }),

  orderHistory: (c: YellowProClient, marketType: MarketType, market: string, query: PageQuery = {}) =>
    c.private("GET", `${PREFIX[marketType]}/orders`, { market, ...query }),

  myTrades: (
    c: YellowProClient,
    marketType: MarketType,
    market?: string,
    query: PageQuery & { start_time?: number; end_time?: number } = {},
  ) => c.private("GET", `${PREFIX[marketType]}/trades`, { market, ...query }),

  positions: (c: YellowProClient) => c.private("GET", "perpetual/positions"),

  positionHistory: (c: YellowProClient, market?: string, query: PageQuery = {}) =>
    c.private("GET", "perpetual/position-history", { market, ...query }),

  positionMode: (c: YellowProClient) => c.private("GET", "perpetual/accounts"),

  feeSchedule: (c: YellowProClient) => c.private("GET", "perpetual/account/fee-schedule"),

  fundingPayments: (
    c: YellowProClient,
    scope: "account" | "position" = "account",
    market?: string,
    query: PageQuery = {},
  ) =>
    c.private(
      "GET",
      scope === "position" ? "perpetual/position/funding-payments" : "perpetual/account/funding-payments",
      { market, ...query },
    ),

  placeOrder: (c: YellowProClient, marketType: MarketType, order: OrderInput) => {
    const type = order.order_type; // single-order endpoint takes limit|market; post_only is batch-only
    requirePrice(order, type);
    const body: Params = {
      market: order.market,
      side: order.side,
      type,
      amount: order.amount,
      time_in_force: resolveTimeInForce(type, order.time_in_force),
    };
    if (type !== "market" && order.price !== undefined) {
      body.price = order.price;
    }
    if (marketType === "perp") {
      body.direction = resolveDirection(order);
      body.leverage = order.leverage ?? "1";
      body.margin_mode = "cross";
      if (order.reduce_only) {
        body.reduce_only = true;
      }
    }
    return c.private("POST", `${PREFIX[marketType]}/order`, body);
  },

  placeOrders: (c: YellowProClient, marketType: MarketType, orders: OrderInput[]) => {
    if (orders.length === 0) {
      throw new YellowProError("orders must not be empty");
    }
    if (marketType === "perp") {
      const operations = orders.map((order) => {
        const type = resolveType(order);
        requirePrice(order, type);
        const op: Params = {
          operation: "create",
          market: order.market,
          side: order.side,
          direction: resolveDirection(order),
          amount: order.amount,
          type,
          leverage: order.leverage ?? "1",
          time_in_force: resolveTimeInForce(type, order.time_in_force),
        };
        if (type !== "market" && order.price !== undefined) {
          op.price = order.price;
        }
        if (order.reduce_only) {
          op.reduce_only = true;
        }
        if (order.client_order_id !== undefined) {
          op.client_operation_id = order.client_order_id;
        }
        return op;
      });
      return c.private("POST", "perpetual/order/batch", { operations });
    }
    const operations = orders.map((order) => {
      const type = resolveType(order);
      requirePrice(order, type);
      const spotOrder: Params = {
        market: order.market,
        side: order.side,
        amount: order.amount,
        type,
        time_in_force: resolveTimeInForce(type, order.time_in_force),
      };
      if (type !== "market" && order.price !== undefined) {
        spotOrder.price = order.price;
      }
      return { action: "create", order: spotOrder };
    });
    return c.private("POST", "spot/orders/batch", { operations });
  },

  cancelOrder: (
    c: YellowProClient,
    marketType: MarketType,
    market: string,
    orderId: string,
    orderType: "limit" | "market" = "limit",
  ) => {
    const params: Params = { order_uuid: orderId, market };
    if (marketType === "spot") {
      params.type = orderType; // spot cancel requires the order 'type' field
    }
    return c.private("DELETE", `${PREFIX[marketType]}/order`, params);
  },

  cancelOrders: (c: YellowProClient, marketType: MarketType, market: string, orderIds: string[]) => {
    if (orderIds.length === 0) {
      throw new YellowProError("order_ids must not be empty");
    }
    if (marketType === "perp") {
      const operations = orderIds.map((id) => ({ operation: "cancel", market, order_uuid: id }));
      return c.private("POST", "perpetual/order/batch", { operations });
    }
    const operations = orderIds.map((id) => ({ action: "cancel", cancel: { order_uuid: id, market } }));
    return c.private("POST", "spot/orders/batch", { operations });
  },

  setLeverage: (c: YellowProClient, market: string, leverage: string) =>
    c.private("POST", "perpetual/leverage", { market, leverage }),

  setPositionMode: (c: YellowProClient, market: string, hedged: boolean) =>
    c.private("POST", "perpetual/position-mode", { market, position_mode: hedged ? "HEDGE" : "ONE_WAY" }),

  transfer: (
    c: YellowProClient,
    asset: string,
    amount: string,
    fromAccount: "spot" | "perps",
    toAccount: "spot" | "perps",
  ) =>
    c.private("POST", "accounts/transfer", {
      source_account_type: fromAccount,
      dest_account_type: toAccount,
      asset_symbol: asset,
      amount,
    }),
};

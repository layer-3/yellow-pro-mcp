import type { Params, YellowProClient } from "../client.js";
import {
  normalizeSpotCancelType,
  resolveDirection,
  resolveTimeInForce,
  validateOrderPrices,
} from "./helpers.js";
import {
  PREFIX,
  type CancelOrderInput,
  type MarketType,
  type OrderInput,
  type TransferInput,
} from "./types.js";

export const tradingApi = {
  placeOrder: (client: YellowProClient, marketType: MarketType, order: OrderInput) => {
    const type = order.order_type;
    validateOrderPrices(order);
    const body: Params = {
      market: order.market,
      side: order.side,
      type,
      amount: order.amount,
      time_in_force: resolveTimeInForce(type, order.time_in_force),
    };
    if (["limit", "post_only", "trigger_limit"].includes(type) && order.price !== undefined) {
      body.price = order.price;
    }
    if ((type === "trigger_limit" || type === "trigger_market") && order.trigger_price !== undefined) {
      body.trigger_price = order.trigger_price;
    }
    if (marketType === "perp") {
      body.direction = resolveDirection(order);
      body.leverage = order.leverage ?? "1";
      if (order.client_order_id !== undefined) {
        body.client_order_id = order.client_order_id;
      }
      if ((type === "trigger_limit" || type === "trigger_market") && order.trigger_type !== undefined) {
        body.trigger_type = order.trigger_type;
      }
      if (order.reduce_only) {
        body.reduce_only = true;
      }
    }
    return client.private("POST", `${PREFIX[marketType]}/order`, body);
  },

  cancelOrder: (
    client: YellowProClient,
    marketType: MarketType,
    order: CancelOrderInput,
  ) => {
    const params: Params = { order_uuid: order.order_id, market: order.market };
    if (marketType === "spot") {
      params.type = normalizeSpotCancelType(order.order_type ?? "limit");
    }
    return client.private("DELETE", `${PREFIX[marketType]}/order`, params);
  },

  cancelAllOrders: (client: YellowProClient, marketType: MarketType, market?: string) =>
    client.private("DELETE", `${PREFIX[marketType]}/orders`, market === undefined ? {} : { market }),

  closePositions: (client: YellowProClient, market?: string) =>
    client.private("POST", "perpetual/positions/close", market === undefined ? {} : { market }),

  setLeverage: (client: YellowProClient, market: string, leverage: string) =>
    client.private("POST", "perpetual/leverage", { market, leverage }),

  transfer: (client: YellowProClient, transfer: TransferInput) =>
    client.private("POST", "accounts/transfer", {
      source_account_type: transfer.from_account,
      dest_account_type: transfer.to_account,
      asset_symbol: transfer.asset,
      amount: transfer.amount,
    }),
};

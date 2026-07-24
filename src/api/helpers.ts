import type { Params } from "../client.js";
import { YellowProError } from "../client.js";
import type { CancelOrderType, CursorQuery, OrderInput } from "./types.js";

export function resolveTimeInForce(type: string, timeInForce?: string): string {
  return (timeInForce ?? (type === "market" || type === "trigger_market" ? "ioc" : "gtc")).toLowerCase();
}

export function resolveDirection(order: OrderInput): string {
  if (order.direction) {
    return order.direction;
  }
  if (order.reduce_only) {
    return order.side === "buy" ? "short" : "long";
  }
  return order.side === "buy" ? "long" : "short";
}

export function validateOrderPrices(order: OrderInput): void {
  if (["limit", "post_only", "trigger_limit"].includes(order.order_type) && order.price === undefined) {
    throw new YellowProError(`${order.order_type} orders require a price`);
  }
  if (
    (order.order_type === "trigger_limit" || order.order_type === "trigger_market")
    && order.trigger_price === undefined
  ) {
    throw new YellowProError(`${order.order_type} orders require trigger_price`);
  }
}

export function normalizeSpotCancelType(orderType: CancelOrderType): CancelOrderType {
  if (orderType === "trigger_limit") {
    return "stop_limit";
  }
  if (orderType === "trigger_market") {
    return "stop_market";
  }
  return orderType;
}

export function cleanParams(params: Params): Params {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null),
  );
}

export function cursorParams<T extends CursorQuery>(query: T): Params {
  const params = cleanParams(Object.fromEntries(Object.entries(query)));
  if (query.cursor === undefined) {
    params.use_cursor = true;
  }
  return params;
}

export const PREFIX = { spot: "spot", perp: "perpetual" } as const;
export type MarketType = keyof typeof PREFIX;
export type OrderType = "limit" | "market" | "post_only" | "trigger_limit" | "trigger_market";
export type CancelOrderType =
  | OrderType
  | "stop_limit"
  | "stop_market"
  | "stop_loss"
  | "take_limit"
  | "take_market"
  | "take_profit";

export interface OrderInput {
  readonly market: string;
  readonly side: "buy" | "sell";
  readonly order_type: OrderType;
  readonly amount: string;
  readonly price?: string;
  readonly trigger_price?: string;
  readonly trigger_type?: "stop_loss" | "take_profit";
  readonly time_in_force?: string;
  readonly reduce_only?: boolean;
  readonly leverage?: string;
  readonly direction?: "long" | "short";
  readonly client_order_id?: string;
}

export interface CancelOrderInput {
  readonly market: string;
  readonly order_id: string;
  readonly order_type?: CancelOrderType;
}

export interface TransferInput {
  readonly asset: string;
  readonly amount: string;
  readonly from_account: "spot" | "perps";
  readonly to_account: "spot" | "perps";
}

export interface CursorQuery {
  readonly cursor?: string;
  readonly page_size?: number;
}

export interface KlineQuery {
  readonly interval?: string;
  readonly start_time?: number;
  readonly end_time?: number;
  readonly limit?: number;
}

export interface SpotAccountQuery {
  readonly asset?: string;
  readonly asset_like?: string;
}

export interface OpenOrdersQuery extends CursorQuery {
  readonly market?: string;
  readonly asset?: string;
  readonly market_like?: string;
}

export interface OrderHistoryQuery extends CursorQuery {
  readonly market?: string;
  readonly market_like?: string;
}

export interface TradeHistoryQuery extends OrderHistoryQuery {
  readonly start_time?: string;
  readonly end_time?: string;
}

export interface PositionHistoryQuery extends CursorQuery {
  readonly market?: string;
  readonly opened_from?: string;
  readonly opened_to?: string;
  readonly closed_from?: string;
  readonly closed_to?: string;
  readonly sort_by?: "opened_at" | "closed_at";
  readonly sort_dir?: "asc" | "desc";
}

export interface PositionHistoryDetailQuery {
  readonly cursor?: string;
  readonly page_size?: number;
}

export interface FundingPaymentsQuery extends CursorQuery {
  readonly scope?: "account" | "position";
  readonly position_id?: string;
  readonly interval_start?: string;
}

export type TransactionType =
  | "funding_fee"
  | "transfer"
  | "fee"
  | "realized_pnl"
  | "liquidation"
  | "adl";

export interface TransactionHistoryQuery extends CursorQuery {
  readonly type?: TransactionType;
  readonly market?: string;
  readonly asset?: string;
  readonly start_time?: number;
  readonly end_time?: number;
}

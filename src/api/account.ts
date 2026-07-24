import type { YellowProClient } from "../client.js";
import { YellowProError } from "../client.js";
import { cleanParams, cursorParams } from "./helpers.js";
import {
  PREFIX,
  type FundingPaymentsQuery,
  type MarketType,
  type OpenOrdersQuery,
  type OrderHistoryQuery,
  type PositionHistoryDetailQuery,
  type PositionHistoryQuery,
  type SpotAccountQuery,
  type TradeHistoryQuery,
  type TransactionHistoryQuery,
} from "./types.js";

export const accountApi = {
  balance: (client: YellowProClient, marketType: MarketType, query: SpotAccountQuery = {}) =>
    client.private(
      "GET",
      marketType === "spot" ? "spot/account" : "perpetual/balance",
      marketType === "spot" ? { ...query } : {},
    ),

  spotAccounts: (client: YellowProClient) => client.private("GET", "spot/accounts"),

  spotAccount: (client: YellowProClient, query: SpotAccountQuery = {}) =>
    client.private("GET", "spot/account", { ...query }),

  openOrders: (client: YellowProClient, marketType: MarketType, query: OpenOrdersQuery = {}) => {
    const pagination = cursorParams({ cursor: query.cursor, page_size: query.page_size });
    return client.private(
      "GET",
      `${PREFIX[marketType]}/open_orders`,
      cleanParams(marketType === "spot"
        ? { market: query.market, asset: query.asset, ...pagination }
        : { market: query.market, market_like: query.market_like, ...pagination }),
    );
  },

  orderHistory: (client: YellowProClient, marketType: MarketType, query: OrderHistoryQuery = {}) => {
    const pagination = cursorParams({ cursor: query.cursor, page_size: query.page_size });
    return client.private(
      "GET",
      `${PREFIX[marketType]}/orders`,
      cleanParams(marketType === "spot"
        ? { market: query.market, ...pagination }
        : { market: query.market, market_like: query.market_like, ...pagination }),
    );
  },

  myTrades: (client: YellowProClient, marketType: MarketType, query: TradeHistoryQuery = {}) => {
    const pagination = cursorParams({ cursor: query.cursor, page_size: query.page_size });
    return client.private(
      "GET",
      `${PREFIX[marketType]}/trades`,
      cleanParams(marketType === "spot"
        ? { market: query.market, ...pagination }
        : {
          market: query.market,
          market_like: query.market_like,
          start_time: query.start_time,
          end_time: query.end_time,
          ...pagination,
        }),
    );
  },

  positions: (client: YellowProClient) => client.private("GET", "perpetual/positions"),

  positionHistory: (client: YellowProClient, query: PositionHistoryQuery = {}) =>
    client.private("GET", "perpetual/position-history", cursorParams(query)),

  positionHistoryDetail: (
    client: YellowProClient,
    positionId: string,
    query: PositionHistoryDetailQuery = {},
  ) => client.private("GET", `perpetual/position-history/${positionId}`, { ...query }),

  perpetualAccounts: (client: YellowProClient) => client.private("GET", "perpetual/accounts"),

  feeSchedule: (client: YellowProClient) => client.public("GET", "account/fee-schedule"),

  feeTier: (client: YellowProClient) => client.private("GET", "account/fee-tier"),

  marketFeeRate: (client: YellowProClient, marketType: MarketType, market: string) =>
    client.private("GET", `${PREFIX[marketType]}/account/market-fee-rate`, { market }),

  transactionHistory: (client: YellowProClient, query: TransactionHistoryQuery = {}) =>
    client.private("GET", "perpetual/transaction/history", cursorParams(query)),

  fundingPayments: (
    client: YellowProClient,
    query: FundingPaymentsQuery = {},
  ) => {
    const scope = query.scope ?? "account";
    if (scope === "position" && !query.position_id) {
      throw new YellowProError("position funding payments require position_id");
    }
    const pagination = {
      cursor: query.cursor,
      page_size: query.page_size,
      interval_start: query.interval_start,
    };
    return client.private(
      "GET",
      scope === "position" ? "perpetual/position/funding-payments" : "perpetual/account/funding-payments",
      scope === "position"
        ? { position_id: query.position_id, ...cursorParams(pagination) }
        : cursorParams(pagination),
    );
  },
};

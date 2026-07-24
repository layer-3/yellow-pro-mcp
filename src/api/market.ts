import type { Params, YellowProClient } from "../client.js";
import { cursorParams } from "./helpers.js";
import type { CursorQuery, KlineQuery } from "./types.js";

export const marketApi = {
  health: (client: YellowProClient) => client.public("GET", "health"),

  markets: async (client: YellowProClient, marketType: "spot" | "perp" | "all" = "all") => {
    const result: Params = {};
    if (marketType !== "perp") {
      result.spot = await client.public("GET", "spot/exchangeInfo");
    }
    if (marketType !== "spot") {
      try {
        result.perp = await client.public("GET", "perpetual/exchangeInfo");
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        result.perp = { unavailable: error.message };
      }
    }
    return result;
  },

  ticker: (client: YellowProClient, market: string) =>
    client.public("GET", "ticker/24hr", { symbol: market }),

  orderbook: (client: YellowProClient, market: string) =>
    client.public("GET", "orderbook", { symbol: market }),

  klines: (client: YellowProClient, market: string, query: KlineQuery = {}) =>
    client.public("GET", "klines", {
      symbol: market,
      interval: query.interval ?? "1m",
      startTime: query.start_time,
      endTime: query.end_time,
      limit: query.limit,
    }),

  fundingRate: (client: YellowProClient, market: string) =>
    client.public("GET", `perpetual/funding-rate/${market}`),

  fundingRateHistory: (client: YellowProClient, market?: string, query: CursorQuery = {}) =>
    client.public("GET", "perpetual/funding-rates", { symbol: market, ...cursorParams(query) }),

  networks: (client: YellowProClient) => client.public("GET", "spot/networks"),
  transferAssets: (client: YellowProClient) => client.public("GET", "perpetual/transfer-assets"),
};

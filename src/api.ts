import { accountApi } from "./api/account.js";
import { marketApi } from "./api/market.js";
import { tradingApi } from "./api/trading.js";

export * from "./api/types.js";

export const api = {
  ...marketApi,
  ...accountApi,
  ...tradingApi,
};

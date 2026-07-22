/**
 * Minimal yellow_pro REST client — apiKey/secret HMAC auth only.
 *
 * Signature scheme (matches the reference CCXT implementation, ccxt_cpp ts/src/neodax.ts):
 *   payload   = METHOD + /path + timestamp(seconds) + canonical
 *   canonical = sorted "key=value" pairs joined by "|"
 *               (bools -> true/false, arrays/objects -> compact JSON)
 *   signature = HMAC-SHA256(secret, payload) hex
 * Headers: X-API-KEY, X-SIGNATURE, X-TIMESTAMP.
 */
import { createHmac } from "node:crypto";

export const DEFAULT_BASE_URL = "https://trade.api.yellow.pro";

export type Params = Record<string, unknown>;

export function canonicalize(params: Params): string {
  return Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      let text: string;
      if (typeof value === "boolean") {
        text = value ? "true" : "false";
      } else if (typeof value === "object" && value !== null) {
        text = JSON.stringify(value);
      } else {
        text = String(value);
      }
      return `${key}=${text}`;
    })
    .join("|");
}

export function sign(secret: string, method: string, path: string, timestamp: string, params: Params): string {
  const payload = `${method}/${path}${timestamp}${canonicalize(params)}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export class YellowProError extends Error {}

export interface ClientOptions {
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  appSessionId?: string;
  /** minimum gap between requests in ms (crude rate limiter, default 100ms ≈ 10 rps) */
  minRequestGapMs?: number;
}

export function clientFromEnv(env: NodeJS.ProcessEnv = process.env): YellowProClient {
  const gap = Number(env.YELLOW_PRO_RATE_LIMIT_MS);
  return new YellowProClient({
    baseUrl: env.YELLOW_PRO_BASE_URL,
    apiKey: env.YELLOW_PRO_API_KEY,
    apiSecret: env.YELLOW_PRO_API_SECRET,
    appSessionId: env.YELLOW_PRO_APP_SESSION_ID,
    minRequestGapMs: Number.isFinite(gap) && gap >= 0 ? gap : undefined,
  });
}

export class YellowProClient {
  private readonly baseUrl: string;
  private readonly opts: ClientOptions;
  private nextRequestSlot = 0;

  constructor(opts: ClientOptions = {}) {
    this.opts = opts;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async public(method: string, path: string, params: Params = {}): Promise<unknown> {
    return this.request(method, path, params, false);
  }

  async private(method: string, path: string, params: Params = {}): Promise<unknown> {
    if (!this.opts.apiKey || !this.opts.apiSecret) {
      throw new YellowProError("missing credentials: set YELLOW_PRO_API_KEY and YELLOW_PRO_API_SECRET");
    }
    if (!this.opts.appSessionId) {
      throw new YellowProError("missing app session: set YELLOW_PRO_APP_SESSION_ID");
    }
    return this.request(method, path, { app_session_id: this.opts.appSessionId, ...params }, true);
  }

  // ponytail: min-gap throttle; upgrade to a token bucket if bursts ever matter.
  // Slot is reserved synchronously (no await first), so concurrent calls space out correctly.
  private async throttle(): Promise<void> {
    const gap = this.opts.minRequestGapMs ?? 100;
    const now = Date.now();
    const slot = Math.max(now, this.nextRequestSlot);
    this.nextRequestSlot = slot + gap;
    if (slot > now) {
      await new Promise((resolve) => setTimeout(resolve, slot - now));
    }
  }

  private async request(method: string, path: string, params: Params, isPrivate: boolean): Promise<unknown> {
    await this.throttle();
    const clean: Params = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        clean[key] = value;
      }
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isPrivate) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      headers["X-API-KEY"] = this.opts.apiKey as string;
      headers["X-SIGNATURE"] = sign(this.opts.apiSecret as string, method, path, timestamp, clean);
      headers["X-TIMESTAMP"] = timestamp;
    }
    let url = `${this.baseUrl}/${path}`;
    if (method === "GET" || method === "DELETE") {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(clean)) {
        query.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
      const queryString = query.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    const body = method === "POST" || method === "DELETE" ? JSON.stringify(clean) : undefined;
    let response: Response;
    try {
      response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new YellowProError(`yellow_pro request failed: ${method} /${path}: ${String(error)}`);
    }
    return this.handleResponse(method, path, response);
  }

  private async handleResponse(method: string, path: string, response: Response): Promise<unknown> {
    const bodyText = await response.text();
    const context = `${method} /${path} -> ${response.status}: ${bodyText.slice(0, 500)}`;
    if (response.status === 401 || response.status === 403) {
      throw new YellowProError(`yellow_pro authentication error: ${context}`);
    }
    if (response.status === 429) {
      throw new YellowProError(`yellow_pro rate limit exceeded: ${context}`);
    }
    if (response.status >= 400) {
      throw new YellowProError(`yellow_pro error: ${context}`);
    }
    let data: unknown;
    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new YellowProError(`yellow_pro returned non-JSON response: ${context}`);
    }
    // error-shaped 200 responses: {"error": ...} / {"success": false} / {"status": "error"}
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      const record = data as Params;
      const status = String(record.status ?? "").toLowerCase();
      if (
        record.error != null ||
        record.success === false ||
        status === "error" || status === "failed" || status === "failure"
      ) {
        throw new YellowProError(`yellow_pro error: ${context}`);
      }
    }
    return data;
  }
}

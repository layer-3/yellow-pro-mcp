import { ENVIRONMENTS, type StoredCredentials, type YellowProEnvironment } from "./credentials.js";
import { YellowProError } from "./errors.js";

interface PairingKeyResponse {
  id: string;
  api_key: string;
  app_session_id: string;
  account_type: string;
  scopes: string[];
  status: string;
}

interface PairingResponse {
  key: PairingKeyResponse;
  secret: string;
}

function parsePairingResponse(value: unknown, environment: YellowProEnvironment, client: string): StoredCredentials {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new YellowProError("pairing returned an invalid response");
  }
  const response = value as Partial<PairingResponse>;
  const key = response.key;
  if (
    typeof key !== "object" || key === null ||
    typeof key.id !== "string" || typeof key.api_key !== "string" ||
    typeof key.app_session_id !== "string" || key.account_type !== "primary" ||
    !Array.isArray(key.scopes) || !key.scopes.every((scope) => typeof scope === "string") ||
    key.status !== "active" || typeof response.secret !== "string" || response.secret === "" ||
    key.id === "" || key.api_key === "" || key.app_session_id === "" || key.scopes.length === 0
  ) {
    throw new YellowProError("pairing returned an invalid credential response");
  }
  return {
    version: 1,
    environment,
    keyId: key.id,
    apiKey: key.api_key,
    apiSecret: response.secret,
    appSessionId: key.app_session_id,
    scopes: key.scopes,
    client,
  };
}

export async function redeemPairingCode(
  code: string,
  environment: YellowProEnvironment,
  client: string,
  fetcher: typeof fetch = fetch,
): Promise<StoredCredentials> {
  if (!/^yp_pair_[a-f0-9]{64}$/.test(code)) {
    throw new YellowProError("invalid pairing code format");
  }
  let response: Response;
  try {
    response = await fetcher(`${ENVIRONMENTS[environment].authUrl}/agent/pairing-codes/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairing_code: code }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new YellowProError(`pairing request failed: ${String(error)}`);
  }
  if (!response.ok) {
    let code = `HTTP ${response.status}`;
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === "string") {
        code = body.error;
      }
    } catch {
      // Keep the status-only error; response bodies may contain intermediary HTML.
    }
    throw new YellowProError(`pairing failed: ${code}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new YellowProError("pairing returned a non-JSON response");
  }
  return parsePairingResponse(body, environment, client);
}

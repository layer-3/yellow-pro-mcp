import { setup, type SetupRunner } from "./cli/support.js";
import {
  credentialsPath,
  connectionUrls,
  deleteCredentials,
  readCredentials,
  writeCredentials,
} from "./credentials.js";
import { YellowProClient, YellowProError } from "./client.js";
import { redeemPairingCode } from "./pairing.js";

export interface ConnectOptions {
  code: string;
  client: string;
  authUrl?: string;
  apiUrl?: string;
  replace: boolean;
  path?: string;
  fetcher?: typeof fetch;
  setupRunner?: SetupRunner;
}

async function verifyCredential(
  apiKey: string,
  apiSecret: string,
  appSessionId: string,
  apiUrl: string,
): Promise<void> {
  const client = new YellowProClient({
    baseUrl: apiUrl,
    apiKey,
    apiSecret,
    appSessionId,
    minRequestGapMs: 0,
  });
  await client.private("GET", "spot/account");
}

export async function connect(options: ConnectOptions): Promise<Record<string, unknown>> {
  const path = options.path ?? credentialsPath();
  const urls = connectionUrls(options.authUrl, options.apiUrl);
  if (options.client !== "claude-code" && options.client !== "codex") {
    throw new YellowProError("pairing onboarding currently supports only claude-code and codex");
  }
  if (!options.replace && readCredentials(path)) {
    throw new YellowProError(`Yellow Pro is already configured at ${path}; pass --replace to overwrite it`);
  }
  const credential = await redeemPairingCode(
    options.code,
    urls.authUrl,
    urls.apiUrl,
    options.client,
    options.fetcher,
  );
  await verifyCredential(
    credential.apiKey,
    credential.apiSecret,
    credential.appSessionId,
    credential.apiUrl,
  );
  writeCredentials(credential, path, options.replace);
  try {
    setup(options.client, {
      includeEnvironment: false,
      additionalEnvironment: { YELLOW_PRO_CONFIG_PATH: path },
      allowFallback: false,
      runner: options.setupRunner,
    });
  } catch {
    throw new YellowProError(
      `credentials were stored at ${path}, but ${options.client} registration failed; run yellow-pro setup ${options.client}`,
    );
  }
  return {
    connected: true,
    client: credential.client,
    api_url: credential.apiUrl,
    account_type: "primary",
    scopes: credential.scopes,
    credential_path: path,
    authentication: "valid",
    restart_required: true,
  };
}

export async function connectionStatus(path = credentialsPath()): Promise<Record<string, unknown>> {
  const credential = readCredentials(path);
  if (!credential) {
    return { configured: false, credential_path: path };
  }
  await verifyCredential(
    credential.apiKey,
    credential.apiSecret,
    credential.appSessionId,
    credential.apiUrl,
  );
  return {
    configured: true,
    client: credential.client,
    api_url: credential.apiUrl,
    account_type: "primary",
    scopes: credential.scopes,
    credential_path: path,
    authentication: "valid",
  };
}

export function disconnect(path = credentialsPath()): Record<string, unknown> {
  return {
    disconnected: deleteCredentials(path),
    credential_path: path,
    remote_key_revoked: false,
  };
}

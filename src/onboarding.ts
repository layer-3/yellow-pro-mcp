import { setup, type SetupRunner } from "./cli/support.js";
import {
  credentialsPath,
  connectionUrls,
  deleteCredentials,
  readCredentials,
  validateProfile,
  writeCredentials,
} from "./credentials.js";
import { YellowProClient, YellowProError } from "./client.js";
import { redeemPairingCode } from "./pairing.js";

export interface ConnectOptions {
  code: string;
  client: string;
  profile?: string;
  authUrl?: string;
  apiUrl?: string;
  replace: boolean;
  path?: string;
  fetcher?: typeof fetch;
  setupRunner?: SetupRunner;
  cursorConfigPath?: string;
}

const SUPPORTED_CLIENTS = new Set(["claude-code", "codex", "gemini", "cursor", "hermes", "openclaw"]);

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
  const profile = validateProfile(options.profile ?? options.client);
  const path = options.path ?? credentialsPath(process.env, profile);
  const urls = connectionUrls(options.authUrl, options.apiUrl);
  if (!SUPPORTED_CLIENTS.has(options.client)) {
    throw new YellowProError("pairing onboarding supports claude-code, codex, gemini, cursor, hermes, and openclaw");
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
      additionalEnvironment: options.path
        ? { YELLOW_PRO_CONFIG_PATH: path }
        : { YELLOW_PRO_PROFILE: profile },
      allowFallback: false,
      runner: options.setupRunner,
      cursorConfigPath: options.cursorConfigPath,
    });
  } catch {
    throw new YellowProError(
      `credentials were stored at ${path}, but ${options.client} registration failed; run YELLOW_PRO_PROFILE=${profile} yellow-pro setup ${options.client}`,
    );
  }
  return {
    connected: true,
    client: credential.client,
    profile,
    api_url: credential.apiUrl,
    account_type: credential.accountType,
    scopes: credential.scopes,
    credential_path: path,
    authentication: "valid",
    restart_required: true,
  };
}

export async function connectionStatus(profile?: string, path?: string): Promise<Record<string, unknown>> {
  const selectedProfile = profile ? validateProfile(profile) : undefined;
  const credentialPath = path ?? credentialsPath(process.env, selectedProfile);
  const credential = readCredentials(credentialPath);
  if (!credential) {
    return { configured: false, profile: selectedProfile, credential_path: credentialPath };
  }
  await verifyCredential(
    credential.apiKey,
    credential.apiSecret,
    credential.appSessionId,
    credential.apiUrl,
  );
  return {
    configured: true,
    profile: selectedProfile,
    client: credential.client,
    api_url: credential.apiUrl,
    account_type: credential.accountType,
    scopes: credential.scopes,
    credential_path: credentialPath,
    authentication: "valid",
  };
}

export function disconnect(profile?: string, path?: string): Record<string, unknown> {
  const selectedProfile = profile ? validateProfile(profile) : undefined;
  const credentialPath = path ?? credentialsPath(process.env, selectedProfile);
  return {
    disconnected: deleteCredentials(credentialPath),
    profile: selectedProfile,
    credential_path: credentialPath,
    remote_key_revoked: false,
  };
}

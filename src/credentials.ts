import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { YellowProError } from "./errors.js";

export interface StoredCredentials {
  version: 1;
  apiUrl: string;
  keyId: string;
  apiKey: string;
  apiSecret: string;
  appSessionId: string;
  scopes: string[];
  client: string;
}

export const PRODUCTION_AUTH_URL = "https://auth.api.yellow.pro";
export const PRODUCTION_API_URL = "https://trade.api.yellow.pro";

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.YELLOW_PRO_CONFIG_PATH ?? join(homedir(), ".yellow", "config.json");
}

export function validateServiceUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new YellowProError(`${name} must be a valid URL`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new YellowProError(`${name} must use HTTPS, except for localhost testing`);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "" && url.pathname !== "/")) {
    throw new YellowProError(`${name} must be an origin without credentials, path, query, or fragment`);
  }
  return url.origin;
}

export function connectionUrls(authUrl?: string, apiUrl?: string): { authUrl: string; apiUrl: string } {
  if ((authUrl === undefined) !== (apiUrl === undefined)) {
    throw new YellowProError("--auth-url and --api-url must be provided together");
  }
  return {
    authUrl: validateServiceUrl(authUrl ?? PRODUCTION_AUTH_URL, "auth URL"),
    apiUrl: validateServiceUrl(apiUrl ?? PRODUCTION_API_URL, "API URL"),
  };
}

function validateCredentials(value: unknown): StoredCredentials {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new YellowProError("invalid Yellow Pro credential file");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.apiUrl !== "string") {
    throw new YellowProError("invalid Yellow Pro credential file: missing apiUrl");
  }
  const apiUrl = validateServiceUrl(record.apiUrl, "stored API URL");
  const required = ["keyId", "apiKey", "apiSecret", "appSessionId", "client"] as const;
  for (const key of required) {
    if (typeof record[key] !== "string" || record[key] === "") {
      throw new YellowProError(`invalid Yellow Pro credential file: missing ${key}`);
    }
  }
  if (record.version !== 1 || !Array.isArray(record.scopes) || !record.scopes.every((scope) => typeof scope === "string")) {
    throw new YellowProError("invalid Yellow Pro credential file format");
  }
  return {
    version: 1,
    apiUrl,
    keyId: record.keyId as string,
    apiKey: record.apiKey as string,
    apiSecret: record.apiSecret as string,
    appSessionId: record.appSessionId as string,
    scopes: record.scopes as string[],
    client: record.client as string,
  };
}

export function readCredentials(path = credentialsPath()): StoredCredentials | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return validateCredentials(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    if (error instanceof YellowProError) {
      throw error;
    }
    throw new YellowProError(`failed to read Yellow Pro credential file: ${String(error)}`);
  }
}

export function writeCredentials(credentials: StoredCredentials, path = credentialsPath(), replace = false): void {
  if (existsSync(path) && !replace) {
    throw new YellowProError(`Yellow Pro is already configured at ${path}; pass --replace to overwrite it`);
  }
  validateCredentials(credentials);
  const directory = dirname(path);
  const directoryExists = existsSync(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!directoryExists) {
    chmodSync(directory, 0o700);
  }
  if (process.platform !== "win32" && (statSync(directory).mode & 0o077) !== 0) {
    throw new YellowProError(`credential directory must not be accessible by group or other users: ${directory}`);
  }
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(credentials, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(temporary, 0o600);
    if (replace) {
      renameSync(temporary, path);
    } else {
      linkSync(temporary, path);
      rmSync(temporary);
    }
  } catch (error) {
    rmSync(temporary, { force: true });
    throw new YellowProError(`failed to store Yellow Pro credentials: ${String(error)}`);
  }
}

export function deleteCredentials(path = credentialsPath()): boolean {
  if (!existsSync(path)) {
    return false;
  }
  rmSync(path);
  return true;
}

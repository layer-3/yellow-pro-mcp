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

export type YellowProEnvironment = "production" | "staging" | "uat";

export interface StoredCredentials {
  version: 1;
  environment: YellowProEnvironment;
  keyId: string;
  apiKey: string;
  apiSecret: string;
  appSessionId: string;
  scopes: string[];
  client: string;
}

export const ENVIRONMENTS: Record<YellowProEnvironment, { authUrl: string; apiUrl: string }> = {
  production: {
    authUrl: "https://auth.api.yellow.pro",
    apiUrl: "https://trade.api.yellow.pro",
  },
  staging: {
    authUrl: "https://auth.staging.yellow.pro.neodax.app",
    apiUrl: "https://api.staging.yellow.pro.neodax.app",
  },
  uat: {
    authUrl: "https://auth.uat.yellow.pro.neodax.app",
    apiUrl: "https://api.uat.yellow.pro.neodax.app",
  },
};

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.YELLOW_PRO_CONFIG_PATH ?? join(homedir(), ".yellow", "config.json");
}

export function parseEnvironment(value: string | undefined): YellowProEnvironment {
  const environment = value ?? "production";
  if (environment !== "production" && environment !== "staging" && environment !== "uat") {
    throw new YellowProError("environment must be production, staging, or uat");
  }
  return environment;
}

function validateCredentials(value: unknown): StoredCredentials {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new YellowProError("invalid Yellow Pro credential file");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.environment !== "string") {
    throw new YellowProError("invalid Yellow Pro credential file: missing environment");
  }
  const environment = parseEnvironment(record.environment);
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
    environment,
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

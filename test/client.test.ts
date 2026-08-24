import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { clientFromEnv } from "../src/client.js";
import { writeCredentials } from "../src/credentials.js";

test("base URL override selects an explicit test endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    await clientFromEnv({
      YELLOW_PRO_BASE_URL: "https://test.example",
      YELLOW_PRO_RATE_LIMIT_MS: "0",
    }).public("GET", "health");
    await clientFromEnv({
      YELLOW_PRO_SANDBOX: "true",
      YELLOW_PRO_BASE_URL: "https://override.example",
      YELLOW_PRO_RATE_LIMIT_MS: "0",
    }).public("GET", "health");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(urls, [
    "https://test.example/health",
    "https://override.example/health",
  ]);
});

test("stored UAT credentials are used when environment credentials are absent", async () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-client-"));
  const path = join(directory, "config.json");
  writeCredentials({
    version: 1,
    apiUrl: "https://api.uat.yellow.pro.neodax.app",
    keyId: "key-id",
    apiKey: "stored-key",
    apiSecret: "stored-secret",
    appSessionId: "stored-session",
    scopes: ["read:spot"],
    client: "claude-code",
  }, path);
  const originalFetch = globalThis.fetch;
  let request: { input: string; headers: Headers } | undefined;
  globalThis.fetch = async (input, init) => {
    request = { input: String(input), headers: new Headers(init?.headers) };
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await clientFromEnv({ YELLOW_PRO_CONFIG_PATH: path, YELLOW_PRO_RATE_LIMIT_MS: "0" }).private("GET", "spot/account");
    assert.equal(request?.input, "https://api.uat.yellow.pro.neodax.app/spot/account?app_session_id=stored-session");
    assert.equal(request?.headers.get("X-API-KEY"), "stored-key");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("complete environment credentials do not inherit the stored environment", async () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-client-env-"));
  const path = join(directory, "config.json");
  writeCredentials({
    version: 1,
    apiUrl: "https://api.uat.yellow.pro.neodax.app",
    keyId: "key-id",
    apiKey: "stored-key",
    apiSecret: "stored-secret",
    appSessionId: "stored-session",
    scopes: ["read:spot"],
    client: "claude-code",
  }, path);
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await clientFromEnv({
      YELLOW_PRO_CONFIG_PATH: path,
      YELLOW_PRO_API_KEY: "env-key",
      YELLOW_PRO_API_SECRET: "env-secret",
      YELLOW_PRO_APP_SESSION_ID: "env-session",
      YELLOW_PRO_RATE_LIMIT_MS: "0",
    }).private("GET", "spot/account");
    assert.equal(requestUrl, "https://trade.api.yellow.pro/spot/account?app_session_id=env-session");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("partial environment credentials fail instead of mixing sources", () => {
  assert.throws(() => clientFromEnv({ YELLOW_PRO_API_KEY: "partial" }), /set all of/);
});

test("documented no-data responses return null", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });

  try {
    const result = await clientFromEnv({ YELLOW_PRO_RATE_LIMIT_MS: "0" }).public("GET", "health");
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { readCredentials, writeCredentials } from "../src/credentials.js";
import { connect } from "../src/onboarding.js";

const code = `yp_pair_${"b".repeat(64)}`;

test("connect stores credentials, verifies, and registers Claude without secrets", async () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-connect-"));
  const path = join(directory, "config.json");
  const originalFetch = globalThis.fetch;
  const setupCalls: Array<{ bin: string; args: string[] }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/agent/pairing-codes/redeem")) {
      return new Response(JSON.stringify({
        key: {
          id: "key-id",
          api_key: "api-key",
          app_session_id: "session-id",
          account_type: "primary",
          scopes: ["read:spot", "read:futures"],
          status: "active",
        },
        secret: "api-secret",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    assert.equal(url, "https://api.uat.yellow.pro.neodax.app/spot/account?app_session_id=session-id");
    assert.equal(new Headers(init?.headers).get("X-API-KEY"), "api-key");
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  globalThis.fetch = fetcher;
  try {
    const result = await connect({
      code,
      client: "claude-code",
      authUrl: "https://auth.uat.yellow.pro.neodax.app",
      apiUrl: "https://api.uat.yellow.pro.neodax.app",
      replace: false,
      path,
      fetcher,
      setupRunner: (bin, args) => setupCalls.push({ bin, args }),
    });
    assert.equal(result.connected, true);
    assert.equal(JSON.stringify(result).includes("api-secret"), false);
    assert.equal(readCredentials(path)?.apiSecret, "api-secret");
    assert.deepEqual(setupCalls, [{
      bin: "claude",
      args: [
        "mcp", "add", "yellow_pro", "-s", "user",
        "-e", `YELLOW_PRO_CONFIG_PATH=${path}`,
        "--", "yellow-pro-mcp",
      ],
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failed verification preserves existing credentials during replacement", async () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-connect-replace-"));
  const path = join(directory, "config.json");
  writeCredentials({
    version: 1,
    apiUrl: "https://api.uat.yellow.pro.neodax.app",
    keyId: "old-id",
    apiKey: "old-key",
    apiSecret: "old-secret",
    appSessionId: "old-session",
    scopes: ["read:spot"],
    client: "claude-code",
  }, path);
  const originalFetch = globalThis.fetch;
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes("/agent/pairing-codes/redeem")) {
      return new Response(JSON.stringify({
        key: {
          id: "new-id", api_key: "new-key", app_session_id: "new-session",
          account_type: "primary", scopes: ["read:spot"], status: "active",
        },
        secret: "new-secret",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "invalid_api_key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };
  globalThis.fetch = fetcher;
  try {
    await assert.rejects(connect({
      code,
      client: "claude-code",
      authUrl: "https://auth.uat.yellow.pro.neodax.app",
      apiUrl: "https://api.uat.yellow.pro.neodax.app",
      replace: true,
      path,
      fetcher,
      setupRunner: () => undefined,
    }), /authentication error/);
    assert.equal(readCredentials(path)?.apiKey, "old-key");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("connect registers Codex with only the credential path", async () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-codex-"));
  const path = join(directory, "config.json");
  const originalFetch = globalThis.fetch;
  const setupCalls: Array<{ bin: string; args: string[] }> = [];
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes("/agent/pairing-codes/redeem")) {
      return new Response(JSON.stringify({
        key: {
          id: "codex-id", api_key: "codex-key", app_session_id: "codex-session",
          account_type: "primary", scopes: ["read:spot"], status: "active",
        },
        secret: "codex-secret",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  globalThis.fetch = fetcher;
  try {
    const result = await connect({
      code,
      client: "codex",
      authUrl: "https://auth.uat.yellow.pro.neodax.app",
      apiUrl: "https://api.uat.yellow.pro.neodax.app",
      replace: false,
      path,
      fetcher,
      setupRunner: (bin, args) => setupCalls.push({ bin, args }),
    });
    assert.equal(result.connected, true);
    assert.deepEqual(setupCalls, [{
      bin: "codex",
      args: [
        "mcp", "add", "yellow_pro",
        "--env", `YELLOW_PRO_CONFIG_PATH=${path}`,
        "--", "yellow-pro-mcp",
      ],
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

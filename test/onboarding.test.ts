import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { readCredentials, writeCredentials } from "../src/credentials.js";
import { setup } from "../src/cli/support.js";
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
    assert.equal(result.scope_source, "pairing_time");
    assert.equal(result.permissions_tool, "get_api_key_permissions");
    assert.equal(JSON.stringify(result).includes("api-secret"), false);
    assert.equal(readCredentials(path)?.apiSecret, "api-secret");
    assert.deepEqual(setupCalls, [{
      bin: "claude",
      args: [
        "mcp", "add", "yellow_pro", "-s", "user",
        "-e", `YELLOW_PRO_CONFIG_PATH=${path}`,
        "-e", "YELLOW_PRO_ENABLE_TRADING=true",
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
    accountType: "primary",
    scopes: ["read:spot"],
    client: "claude-code",
  }, path);
  const originalFetch = globalThis.fetch;
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes("/agent/pairing-codes/redeem")) {
      return new Response(JSON.stringify({
        key: {
          id: "new-id", api_key: "new-key", app_session_id: "new-session",
          account_type: "subaccount", scopes: ["read:spot"], status: "active",
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
          account_type: "subaccount", scopes: ["read:spot"], status: "active",
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
        "--env", "YELLOW_PRO_ENABLE_TRADING=true",
        "--", "yellow-pro-mcp",
      ],
    }]);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("connect registers Gemini, Hermes, and OpenClaw without secrets", async () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-agent-connect-"));
  const originalFetch = globalThis.fetch;
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes("/agent/pairing-codes/redeem")) {
      return new Response(JSON.stringify({
        key: {
          id: "key-id", api_key: "api-key", app_session_id: "session-id",
          account_type: "primary", scopes: ["read:spot"], status: "active",
        },
        secret: "api-secret",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  globalThis.fetch = fetcher;
  try {
    const cases = [
      {
        client: "gemini",
        bin: "gemini",
        args: (path: string) => [
          "mcp", "add", "--scope", "user", "--transport", "stdio",
          "--env", `YELLOW_PRO_CONFIG_PATH=${path}`,
          "--env", "YELLOW_PRO_ENABLE_TRADING=true",
          "yellow-pro", "yellow-pro-mcp",
        ],
      },
      {
        client: "hermes",
        bin: "hermes",
        args: (path: string) => [
          "mcp", "add", "yellow_pro", "--command", "yellow-pro-mcp",
          "--env", `YELLOW_PRO_CONFIG_PATH=${path}`,
          "--env", "YELLOW_PRO_ENABLE_TRADING=true",
        ],
      },
      {
        client: "openclaw",
        bin: "openclaw",
        args: (path: string) => [
          "mcp", "add", "yellow_pro", "--command", "yellow-pro-mcp",
          "--env", `YELLOW_PRO_CONFIG_PATH=${path}`,
          "--env", "YELLOW_PRO_ENABLE_TRADING=true",
        ],
      },
    ];
    for (const entry of cases) {
      const path = join(directory, `${entry.client}.json`);
      const setupCalls: Array<{ bin: string; args: string[]; input?: string }> = [];
      const result = await connect({
        code,
        client: entry.client,
        authUrl: "https://auth.uat.yellow.pro.neodax.app",
        apiUrl: "https://api.uat.yellow.pro.neodax.app",
        replace: false,
        path,
        fetcher,
        setupRunner: (bin, args, input) => setupCalls.push({ bin, args, input }),
      });
      assert.equal(result.connected, true);
      assert.equal(JSON.stringify(setupCalls).includes("api-secret"), false);
      assert.deepEqual(setupCalls, [{
        bin: entry.bin,
        args: entry.args(path),
        ...(entry.client === "hermes" ? { input: "y\n" } : { input: undefined }),
      }]);
    }
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("connect merges Cursor MCP config without exposing credentials", async () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-cursor-connect-"));
  const credentialPath = join(directory, "credentials.json");
  const cursorConfigPath = join(directory, ".cursor", "mcp.json");
  mkdirSync(join(directory, ".cursor"));
  writeFileSync(cursorConfigPath, JSON.stringify({
    theme: "dark",
    mcpServers: { existing: { command: "existing-mcp" } },
  }));
  const originalFetch = globalThis.fetch;
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes("/agent/pairing-codes/redeem")) {
      return new Response(JSON.stringify({
        key: {
          id: "cursor-id", api_key: "cursor-key", app_session_id: "cursor-session",
          account_type: "subaccount", scopes: ["read:spot"], status: "active",
        },
        secret: "cursor-secret",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  globalThis.fetch = fetcher;
  try {
    const result = await connect({
      code,
      client: "cursor",
      authUrl: "https://auth.uat.yellow.pro.neodax.app",
      apiUrl: "https://api.uat.yellow.pro.neodax.app",
      replace: false,
      path: credentialPath,
      fetcher,
      cursorConfigPath,
    });
    assert.equal(result.account_type, "subaccount");
    const config = JSON.parse(readFileSync(cursorConfigPath, "utf8"));
    assert.equal(config.theme, "dark");
    assert.deepEqual(config.mcpServers.existing, { command: "existing-mcp" });
    assert.deepEqual(config.mcpServers.yellow_pro, {
      type: "stdio",
      command: "yellow-pro-mcp",
      args: [],
      env: { YELLOW_PRO_CONFIG_PATH: credentialPath, YELLOW_PRO_ENABLE_TRADING: "true" },
    });
    assert.equal(readFileSync(cursorConfigPath, "utf8").includes("cursor-secret"), false);
    if (process.platform !== "win32") {
      assert.equal(statSync(cursorConfigPath).mode & 0o777, 0o600);
    }
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("manual Codex setup preserves profile and trading environment", () => {
  const setupCalls: Array<{ bin: string; args: string[] }> = [];
  const result = setup("codex", {
    env: { YELLOW_PRO_PROFILE: "codex", YELLOW_PRO_ENABLE_TRADING: "true" },
    runner: (bin, args) => setupCalls.push({ bin, args }),
  });

  assert.equal(result, "yellow_pro MCP server registered with Codex CLI");
  assert.deepEqual(setupCalls, [{
    bin: "codex",
    args: [
      "mcp", "add", "yellow_pro",
      "--env", "YELLOW_PRO_ENABLE_TRADING=true",
      "--env", "YELLOW_PRO_PROFILE=codex",
      "--", "yellow-pro-mcp",
    ],
  }]);
});

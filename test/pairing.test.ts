import assert from "node:assert/strict";
import { test } from "node:test";

import { redeemPairingCode } from "../src/pairing.js";

const code = `yp_pair_${"a".repeat(64)}`;

test("redeems a UAT pairing code into stored credentials", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://auth.uat.yellow.pro.neodax.app/agent/pairing-codes/redeem");
    assert.deepEqual(JSON.parse(String(init?.body)), { pairing_code: code });
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
  };

  assert.deepEqual(await redeemPairingCode(
    code,
    "https://auth.uat.yellow.pro.neodax.app",
    "https://api.uat.yellow.pro.neodax.app",
    "claude-code",
    fetcher,
  ), {
    version: 1,
    apiUrl: "https://api.uat.yellow.pro.neodax.app",
    keyId: "key-id",
    apiKey: "api-key",
    apiSecret: "api-secret",
    appSessionId: "session-id",
    accountType: "primary",
    scopes: ["read:spot", "read:futures"],
    client: "claude-code",
  });
});

test("redeems a sub-account pairing code", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    key: {
      id: "key-id",
      api_key: "api-key",
      app_session_id: "agent-session-id",
      account_type: "subaccount",
      scopes: ["read:spot", "read:futures"],
      status: "active",
    },
    secret: "api-secret",
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const credential = await redeemPairingCode(
    code,
    "https://auth.example",
    "https://api.example",
    "codex",
    fetcher,
  );
  assert.equal(credential.appSessionId, "agent-session-id");
  assert.equal(credential.accountType, "subaccount");
});

test("pairing errors expose only the stable error code", async () => {
  const fetcher: typeof fetch = async () => new Response(
    JSON.stringify({ error: "pairing_code_consumed", message: "details" }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
  await assert.rejects(
    redeemPairingCode(code, "https://auth.example", "https://api.example", "claude-code", fetcher),
    /pairing failed: pairing_code_consumed/,
  );
});

test("pairing rejects inactive credentials", async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    key: {
      id: "key-id",
      api_key: "api-key",
      app_session_id: "session-id",
      account_type: "primary",
      scopes: ["read:spot"],
      status: "revoked",
    },
    secret: "api-secret",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    redeemPairingCode(code, "https://auth.example", "https://api.example", "claude-code", fetcher),
    /invalid credential response/,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { clientFromEnv } from "../src/client.js";

test("sandbox mode selects staging URL unless base URL is explicit", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    await clientFromEnv({
      YELLOW_PRO_SANDBOX: "true",
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
    "https://api.staging.yellow.pro.neodax.app/health",
    "https://override.example/health",
  ]);
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

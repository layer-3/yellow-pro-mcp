import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { deleteCredentials, readCredentials, writeCredentials, type StoredCredentials } from "../src/credentials.js";

const credential: StoredCredentials = {
  version: 1,
  environment: "uat",
  keyId: "key-id",
  apiKey: "api-key",
  apiSecret: "api-secret",
  appSessionId: "session-id",
  scopes: ["read:spot", "read:futures"],
  client: "claude-code",
};

test("credentials are written atomically with restrictive permissions", () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-credentials-"));
  const path = join(directory, "nested", "config.json");
  try {
    writeCredentials(credential, path);
    assert.deepEqual(readCredentials(path), credential);
    assert.equal(readFileSync(path, "utf8").includes("api-secret"), true);
    if (process.platform !== "win32") {
      assert.equal(statSync(path).mode & 0o777, 0o600);
      assert.equal(statSync(join(directory, "nested")).mode & 0o777, 0o700);
    }
    assert.throws(() => writeCredentials(credential, path), /already configured/);
    writeCredentials({ ...credential, apiKey: "replacement" }, path, true);
    assert.equal(readCredentials(path)?.apiKey, "replacement");
    assert.equal(deleteCredentials(path), true);
    assert.equal(deleteCredentials(path), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("credentials reject an insecure existing directory", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-insecure-"));
  const insecure = join(directory, "shared");
  mkdirSync(insecure, { mode: 0o777 });
  chmodSync(insecure, 0o777);
  try {
    assert.throws(
      () => writeCredentials(credential, join(insecure, "config.json")),
      /must not be accessible by group or other users/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

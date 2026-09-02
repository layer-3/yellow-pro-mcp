import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  connectionUrls,
  credentialsPath,
  deleteCredentials,
  readCredentials,
  writeCredentials,
  type StoredCredentials,
} from "../src/credentials.js";

const credential: StoredCredentials = {
  version: 1,
  apiUrl: "https://api.uat.example",
  keyId: "key-id",
  apiKey: "api-key",
  apiSecret: "api-secret",
  appSessionId: "session-id",
  accountType: "primary",
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

test("legacy credential files default to the primary account type", () => {
  const directory = mkdtempSync(join(tmpdir(), "yellow-pro-legacy-credentials-"));
  const path = join(directory, "config.json");
  try {
    const { accountType: _accountType, ...legacyCredential } = credential;
    writeFileSync(path, JSON.stringify(legacyCredential));
    assert.equal(readCredentials(path)?.accountType, "primary");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("test endpoint overrides require a complete HTTPS pair", () => {
  assert.deepEqual(connectionUrls(), {
    authUrl: "https://auth.api.yellow.pro",
    apiUrl: "https://trade.api.yellow.pro",
  });
  assert.throws(() => connectionUrls("https://auth.example"), /must be provided together/);
  assert.throws(
    () => connectionUrls("http://auth.example", "http://api.example"),
    /must use HTTPS/,
  );
  assert.deepEqual(connectionUrls("http://localhost:8081", "http://127.0.0.1:8080"), {
    authUrl: "http://localhost:8081",
    apiUrl: "http://127.0.0.1:8080",
  });
});

test("profiles resolve to separate credential files", () => {
  for (const profile of ["claude-code", "codex", "gemini", "cursor", "hermes", "openclaw"]) {
    assert.match(credentialsPath({}, profile), new RegExp(`\\.yellow/connections/${profile}\\.json$`));
  }
  assert.throws(() => credentialsPath({}, "../escape"), /profile must contain/);
});

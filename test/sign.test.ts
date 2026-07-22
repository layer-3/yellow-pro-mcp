/**
 * Signature must match the reference CCXT implementation (ccxt_cpp ts/src/neodax.ts sign()).
 * Expected values were computed independently with node crypto over the reference algorithm.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalize, sign } from "../src/client.js";

const PARAMS = {
  amount: "0.1",
  app_session_id: "sess-1",
  market: "BTCYTEST.USD",
  operations: [{ a: 1 }],
  price: "70000.5",
  reduce_only: true,
  side: "buy",
  type: "limit",
  limit: 50,
};

const EXPECTED_CANONICAL =
  'amount=0.1|app_session_id=sess-1|limit=50|market=BTCYTEST.USD|operations=[{"a":1}]' +
  "|price=70000.5|reduce_only=true|side=buy|type=limit";
const EXPECTED_SIGNATURE = "82e4fd359a66d5d1091c1cefa3e3d07cf10a87811da16cc4881b6ecf8fbdd5e3";

test("canonicalize matches the reference implementation", () => {
  assert.equal(canonicalize(PARAMS), EXPECTED_CANONICAL);
});

test("signature matches the reference implementation", () => {
  assert.equal(sign("topsecret", "POST", "perpetual/order", "1700000000", PARAMS), EXPECTED_SIGNATURE);
});

test("empty params", () => {
  assert.equal(canonicalize({}), "");
  assert.equal(sign("s", "GET", "spot/account", "1", {}).length, 64);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { signedInWith } from "./identity.ts";

const phantom = { address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", walletClientType: "phantom" };
const embedded = { address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", walletClientType: "privy" };

test("вошёл кошельком - кошелёк, даже если почту привязал потом для писем", () => {
  assert.deepEqual(signedInWith({ wallet: phantom, email: { address: "a@b.co" } }), {
    by: "wallet",
    wallet: phantom.address,
  });
  assert.deepEqual(signedInWith({ wallet: phantom }), { by: "wallet", wallet: phantom.address });
});

test("вошёл почтой - почта, а встроенный кошелёк Privy входом не считается", () => {
  assert.deepEqual(signedInWith({ wallet: embedded, email: { address: "a@b.co" } }), {
    by: "email",
    email: "a@b.co",
  });
  assert.deepEqual(signedInWith({ email: { address: "a@b.co" } }), { by: "email", email: "a@b.co" });
});

test("ни кошелька, ни почты - сказать нечего", () => {
  assert.equal(signedInWith({}), null);
  assert.equal(signedInWith(null), null);
});

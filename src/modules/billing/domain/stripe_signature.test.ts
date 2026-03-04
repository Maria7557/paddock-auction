import assert from "node:assert/strict";
import test from "node:test";

import { createStripeSignatureHeader, verifyStripeSignature } from "./stripe_signature";

test("verifyStripeSignature accepts valid signature and timestamp window", () => {
  const payload = JSON.stringify({ id: "evt_123", type: "payment_intent.succeeded" });
  const secret = "whsec_test_secret";
  const timestamp = 1_772_330_400;
  const header = createStripeSignatureHeader(payload, secret, timestamp);

  const valid = verifyStripeSignature(payload, header, secret, timestamp + 120, 300);

  assert.equal(valid, true);
});

test("verifyStripeSignature rejects invalid signature", () => {
  const payload = JSON.stringify({ id: "evt_456", type: "payment_intent.succeeded" });
  const secret = "whsec_test_secret";
  const timestamp = 1_772_330_500;

  const valid = verifyStripeSignature(payload, "t=1772330500,v1=not-valid", secret, timestamp, 300);

  assert.equal(valid, false);
});

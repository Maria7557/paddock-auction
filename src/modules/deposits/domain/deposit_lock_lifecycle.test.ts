import assert from "node:assert/strict";
import test from "node:test";

import { assertCanResolveDepositLock, canResolveDepositLock } from "./deposit_lock_lifecycle";

test("deposit lock lifecycle only allows ACTIVE -> RELEASED/BURNED", () => {
  assert.equal(canResolveDepositLock("ACTIVE", "RELEASED"), true);
  assert.equal(canResolveDepositLock("ACTIVE", "BURNED"), true);
  assert.equal(canResolveDepositLock("RELEASED", "BURNED"), false);
  assert.equal(canResolveDepositLock("BURNED", "RELEASED"), false);

  assert.doesNotThrow(() => assertCanResolveDepositLock("ACTIVE", "RELEASED"));
  assert.throws(() => assertCanResolveDepositLock("RELEASED", "BURNED"));
});

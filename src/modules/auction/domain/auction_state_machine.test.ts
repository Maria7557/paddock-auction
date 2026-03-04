import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAuctionTransitionAllowed,
  canTransitionAuctionState,
  normalizeAuctionState,
} from "./auction_state_machine";

const allowedTransitions: Array<[from: Parameters<typeof canTransitionAuctionState>[0], to: Parameters<typeof canTransitionAuctionState>[1]]> = [
  ["DRAFT", "SCHEDULED"],
  ["SCHEDULED", "LIVE"],
  ["LIVE", "ENDED"],
  ["ENDED", "PAYMENT_PENDING"],
  ["PAYMENT_PENDING", "PAID"],
  ["PAYMENT_PENDING", "DEFAULTED"],
];

const deniedTransitions: Array<[from: Parameters<typeof canTransitionAuctionState>[0], to: Parameters<typeof canTransitionAuctionState>[1]]> = [
  ["DRAFT", "LIVE"],
  ["SCHEDULED", "ENDED"],
  ["LIVE", "PAYMENT_PENDING"],
  ["ENDED", "PAID"],
  ["PAID", "DEFAULTED"],
  ["DEFAULTED", "PAID"],
];

test("auction transition matrix allows only declared transitions", () => {
  for (const [fromState, toState] of allowedTransitions) {
    assert.equal(canTransitionAuctionState(fromState, toState), true);
    assert.doesNotThrow(() => assertAuctionTransitionAllowed(fromState, toState));
  }

  for (const [fromState, toState] of deniedTransitions) {
    assert.equal(canTransitionAuctionState(fromState, toState), false);
    assert.throws(() => assertAuctionTransitionAllowed(fromState, toState));
  }
});

test("legacy CLOSED persistence state is normalized to ENDED", () => {
  assert.equal(normalizeAuctionState("CLOSED"), "ENDED");
  assert.equal(normalizeAuctionState("ENDED"), "ENDED");
  assert.throws(() => normalizeAuctionState("RELISTED"));
});

import assert from "node:assert/strict";
import test from "node:test";

import { readDisableBiddingFlag } from "../../src/modules/platform/application/bid_guardrails";
import { withStructuredMutationLogging } from "../../src/modules/platform/transport/structured_logging_middleware";

test("guardrails default behavior remains non-blocking when dependencies are unavailable", async () => {
  const flag = await readDisableBiddingFlag(null);

  assert.equal(typeof flag.disabled, "boolean");
  assert.equal(flag.source, "default");
});

test("structured logging middleware does not alter non-mutation requests", async () => {
  const wrappedHandler = withStructuredMutationLogging(async () => {
    return new Response("ok", { status: 200 });
  });

  const response = await wrappedHandler(new Request("https://example.com/api/health", { method: "GET" }), {});

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-correlation-id"), null);
});

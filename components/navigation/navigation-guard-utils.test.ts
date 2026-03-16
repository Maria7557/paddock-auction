import assert from "node:assert/strict";
import test from "node:test";

import {
  getNavigationTargetPath,
  shouldBypassGuardedLinkClick,
} from "@/components/navigation/navigation-guard-utils";

test("getNavigationTargetPath normalizes relative app routes", () => {
  assert.equal(getNavigationTargetPath("/seller/vehicles/new?created=1"), "/seller/vehicles/new");
  assert.equal(getNavigationTargetPath("seller/dashboard/"), "/seller/dashboard");
});

test("getNavigationTargetPath ignores hash-only navigation", () => {
  assert.equal(getNavigationTargetPath("#section-1"), null);
});

test("shouldBypassGuardedLinkClick bypasses modified clicks", () => {
  assert.equal(
    shouldBypassGuardedLinkClick({
      altKey: false,
      button: 0,
      ctrlKey: true,
      defaultPrevented: false,
      metaKey: false,
      nextPathname: "/seller/vehicles",
      shiftKey: false,
    }),
    true,
  );
});

test("shouldBypassGuardedLinkClick keeps normal in-app navigation guarded", () => {
  assert.equal(
    shouldBypassGuardedLinkClick({
      altKey: false,
      button: 0,
      ctrlKey: false,
      defaultPrevented: false,
      metaKey: false,
      nextPathname: "/seller/vehicles",
      shiftKey: false,
    }),
    false,
  );
});

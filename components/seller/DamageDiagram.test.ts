import assert from "node:assert/strict";
import test from "node:test";

import { getDamageMapWithoutZone, getNextDiagramDamageMap, getNextMarkedDamageMap } from "@/components/seller/DamageDiagram";

test("getNextDiagramDamageMap cycles from none to minor to major to removed", () => {
  const minor = getNextDiagramDamageMap({}, "hood");
  assert.deepEqual(minor, { hood: "MINOR" });

  const major = getNextDiagramDamageMap(minor, "hood");
  assert.deepEqual(major, { hood: "MAJOR" });

  const removed = getNextDiagramDamageMap(major, "hood");
  assert.deepEqual(removed, {});
});

test("getNextMarkedDamageMap toggles a marked zone between minor and major", () => {
  assert.deepEqual(getNextMarkedDamageMap({ hood: "MINOR" }, "hood"), { hood: "MAJOR" });
  assert.deepEqual(getNextMarkedDamageMap({ hood: "MAJOR" }, "hood"), { hood: "MINOR" });
});

test("getNextMarkedDamageMap ignores zones that are not already marked", () => {
  const value = { hood: "MINOR" } as const;

  assert.equal(getNextMarkedDamageMap(value, "roof"), value);
});

test("getDamageMapWithoutZone removes only the requested zone", () => {
  assert.deepEqual(
    getDamageMapWithoutZone(
      {
        hood: "MINOR",
        roof: "MAJOR",
      },
      "hood",
    ),
    { roof: "MAJOR" },
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  AUCTION_CATEGORY_ORDER,
  getAuctionCategoryLabel,
  inferAuctionCategory,
  isAuctionCategory,
} from "./auction_category";

test("auction category order matches the homepage presentation order", () => {
  assert.deepEqual(AUCTION_CATEGORY_ORDER, ["luxury", "suv", "sedan", "sports"]);
});

test("inferAuctionCategory classifies SUVs by body type", () => {
  assert.equal(inferAuctionCategory("Toyota", "SUV"), "suv");
});

test("inferAuctionCategory classifies luxury marques even with non-SUV body styles", () => {
  assert.equal(inferAuctionCategory("Bentley", "Coupe"), "luxury");
});

test("inferAuctionCategory classifies sports body styles when the make is not luxury", () => {
  assert.equal(inferAuctionCategory("Ford", "Sport Coupe"), "sports");
});

test("inferAuctionCategory falls back to sedan for standard passenger cars", () => {
  assert.equal(inferAuctionCategory("Hyundai", "Sedan"), "sedan");
});

test("category helpers validate slugs and localize labels", () => {
  assert.equal(isAuctionCategory("suv"), true);
  assert.equal(isAuctionCategory("wagon"), false);
  assert.equal(getAuctionCategoryLabel("sports", "ru"), "Спорт и купе");
  assert.equal(getAuctionCategoryLabel("sedan", "en"), "Fleet Sedans");
});

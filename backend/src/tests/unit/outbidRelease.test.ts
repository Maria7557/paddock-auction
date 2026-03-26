import { describe, expect, it } from "vitest";

import {
  BUYER_BID_SUMMARY_NOT_FOUND_CODE,
  BUYING_POWER_ACTIVE_BIDS_NEGATIVE_CODE,
  BuyingPowerCommandError,
  recordLeadingBid,
  releaseLeadingBidOnOutbid,
} from "../../modules/deposits/application/deposit_commands";
import { createMockBuyingPowerTx, decimal } from "./helpers/mock_buying_power_tx";

describe("outbid release commands", () => {
  it("previous leader active_bids_total decreases by outbid amount", async () => {
    const previousLeaderCompanyId = "company-prev";
    const { tx, state } = createMockBuyingPowerTx({
      summaries: [{ companyId: previousLeaderCompanyId, activeBidsTotal: 120_000 }],
    });

    const snapshot = await releaseLeadingBidOnOutbid(tx, previousLeaderCompanyId, decimal(100_000));

    expect(snapshot.activeBidsTotal.toFixed(2)).toBe("20000.00");
    expect(state.summaries.get(previousLeaderCompanyId)?.active_bids_total.toFixed(2)).toBe(
      "20000.00",
    );
    expect(state.outboxEvents).toHaveLength(1);
    expect(state.outboxEvents[0]).toMatchObject({
      eventType: "BUYER_OUTBID",
      aggregateId: previousLeaderCompanyId,
    });
  });

  it("new leader active_bids_total increases by new bid amount", async () => {
    const newLeaderCompanyId = "company-new";
    const { tx, state } = createMockBuyingPowerTx({
      summaries: [{ companyId: newLeaderCompanyId, activeBidsTotal: 50_000 }],
    });

    const snapshot = await recordLeadingBid(tx, newLeaderCompanyId, decimal(100_000));

    expect(snapshot.activeBidsTotal.toFixed(2)).toBe("150000.00");
    expect(state.summaries.get(newLeaderCompanyId)?.active_bids_total.toFixed(2)).toBe(
      "150000.00",
    );
  });

  it("throws structured error if summary row does not exist", async () => {
    const { tx } = createMockBuyingPowerTx();

    await expect(releaseLeadingBidOnOutbid(tx, "missing-company", decimal(10_000))).rejects.toMatchObject(
      {
        name: "BuyingPowerCommandError",
        code: BUYER_BID_SUMMARY_NOT_FOUND_CODE,
      } satisfies Partial<BuyingPowerCommandError>,
    );
  });

  it("throws structured error if outbid would make total negative", async () => {
    const companyId = "company-negative";
    const { tx } = createMockBuyingPowerTx({
      summaries: [{ companyId, activeBidsTotal: 50_000 }],
    });

    await expect(releaseLeadingBidOnOutbid(tx, companyId, decimal(100_000))).rejects.toMatchObject(
      {
        name: "BuyingPowerCommandError",
        code: BUYING_POWER_ACTIVE_BIDS_NEGATIVE_CODE,
      } satisfies Partial<BuyingPowerCommandError>,
    );
  });
});

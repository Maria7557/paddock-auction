import { describe, expect, it } from "vitest";

import {
  acquireOrVerifyBuyingPowerLock,
  readBuyingPowerSnapshot,
  recordLeadingBid,
  releaseLeadingBidOnOutbid,
} from "../../modules/deposits/application/deposit_commands";
import { createMockBuyingPowerTx, decimal } from "./helpers/mock_buying_power_tx";

async function placeLeadingBid(
  tx: Parameters<typeof acquireOrVerifyBuyingPowerLock>[0],
  companyId: string,
  amount: number,
): Promise<void> {
  const gateResult = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(amount));

  expect(gateResult.allowed).toBe(true);

  await recordLeadingBid(tx, companyId, decimal(amount));
}

describe("multi-auction buying power participation", () => {
  it("buyer can lead in auction A + B + C simultaneously at exactly 300k ceiling", async () => {
    const companyId = "company-multi-300k";
    const { tx } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 5_000 }],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    await placeLeadingBid(tx, companyId, 100_000);
    await placeLeadingBid(tx, companyId, 100_000);
    await placeLeadingBid(tx, companyId, 100_000);

    const snapshot = await readBuyingPowerSnapshot(tx, companyId);

    expect(snapshot.activeBidsTotal.toFixed(2)).toBe("300000.00");
    expect(snapshot.ceiling.toFixed(2)).toBe("300000.00");
    expect(snapshot.remaining.toFixed(2)).toBe("0.00");
  });

  it("buyer cannot add auction D when already at the 300k ceiling", async () => {
    const companyId = "company-ceiling-hit";
    const { tx } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 5_000 }],
      summaries: [{ companyId, activeBidsTotal: 300_000 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(1_000));

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("CEILING_EXCEEDED");
      expect(result.shortfall.toFixed(2)).toBe("1000.00");
    }
  });

  it("buyer outbid in auction B can immediately place 100k on auction D", async () => {
    const companyId = "company-outbid-reuse";
    const { tx } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 5_000 }],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    await placeLeadingBid(tx, companyId, 100_000);
    await placeLeadingBid(tx, companyId, 100_000);
    await placeLeadingBid(tx, companyId, 100_000);

    const releasedSnapshot = await releaseLeadingBidOnOutbid(tx, companyId, decimal(100_000));
    expect(releasedSnapshot.activeBidsTotal.toFixed(2)).toBe("200000.00");

    const gateResult = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(100_000));
    expect(gateResult.allowed).toBe(true);

    await recordLeadingBid(tx, companyId, decimal(100_000));

    const snapshot = await readBuyingPowerSnapshot(tx, companyId);
    expect(snapshot.activeBidsTotal.toFixed(2)).toBe("300000.00");
    expect(snapshot.remaining.toFixed(2)).toBe("0.00");
  });

  it("buyer with 10000 deposit has 600k ceiling", async () => {
    const companyId = "company-vip-ish";
    const { tx } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 10_000 }],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    for (let index = 0; index < 6; index += 1) {
      await placeLeadingBid(tx, companyId, 100_000);
    }

    const snapshot = await readBuyingPowerSnapshot(tx, companyId);

    expect(snapshot.ceiling.toFixed(2)).toBe("600000.00");
    expect(snapshot.activeBidsTotal.toFixed(2)).toBe("600000.00");
    expect(snapshot.remaining.toFixed(2)).toBe("0.00");
  });
});

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { acquireOrVerifyBuyingPowerLock } from "../../modules/deposits/application/deposit_commands";
import {
  calculateBuyingPowerCeiling,
  createMockBuyingPowerTx,
  decimal,
} from "./helpers/mock_buying_power_tx";

describe("acquireOrVerifyBuyingPowerLock", () => {
  const companyId = "company-gate";

  it("allows bid when active_bids_total + amount < ceiling", async () => {
    const { tx, state } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 5_000 }],
      summaries: [{ companyId, activeBidsTotal: 100_000 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(100_000));

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.currentTotal.toFixed(2)).toBe("100000.00");
      expect(result.ceiling.toFixed(2)).toBe("300000.00");
      expect(result.remaining.toFixed(2)).toBe("100000.00");
    }
    expect(state.locks.get(companyId)?.amount.toFixed(2)).toBe("5000.00");
    expect(state.locks.get(companyId)?.buying_power_ceiling.toFixed(2)).toBe("300000.00");
  });

  it("allows bid when active_bids_total + amount == ceiling", async () => {
    const { tx } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 5_000 }],
      summaries: [{ companyId, activeBidsTotal: 200_000 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(100_000));

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.remaining.toFixed(2)).toBe("0.00");
      expect(result.ceiling.toFixed(2)).toBe("300000.00");
    }
  });

  it("rejects when active_bids_total + amount > ceiling", async () => {
    const { tx } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 5_000 }],
      summaries: [{ companyId, activeBidsTotal: 250_000 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(60_000));

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("CEILING_EXCEEDED");
      expect(result.currentTotal.toFixed(2)).toBe("250000.00");
      expect(result.ceiling.toFixed(2)).toBe("300000.00");
      expect(result.requested.toFixed(2)).toBe("60000.00");
      expect(result.shortfall.toFixed(2)).toBe("10000.00");
    }
  });

  it("rejects when available_balance < 5000", async () => {
    const { tx } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 4_999 }],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(1_000));

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("INSUFFICIENT_DEPOSIT");
    }
  });

  it("uses ceiling formula 5000 -> 300000", async () => {
    const { tx, state } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 5_000 }],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(1));

    expect(result.allowed).toBe(true);
    expect(state.locks.get(companyId)?.buying_power_ceiling.toFixed(2)).toBe("300000.00");
  });

  it("uses ceiling formula 10000 -> 600000", async () => {
    const { tx, state } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 10_000 }],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(1));

    expect(result.allowed).toBe(true);
    expect(state.locks.get(companyId)?.buying_power_ceiling.toFixed(2)).toBe("600000.00");
  });

  it("uses ceiling formula 15000 -> 900000", async () => {
    const { tx, state } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 15_000 }],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(1));

    expect(result.allowed).toBe(true);
    expect(state.locks.get(companyId)?.buying_power_ceiling.toFixed(2)).toBe("900000.00");
  });

  it("allows bid on lot priced at 299999 (just under ceiling)", async () => {
    const { tx } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 5_000 }],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(299_999));

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.remaining.toFixed(2)).toBe("1.00");
    }
  });

  it("rejects single bid amount > ceiling even if total = 0", async () => {
    const { tx } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 5_000 }],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, decimal(300_001));

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("CEILING_EXCEEDED");
      expect(result.shortfall.toFixed(2)).toBe("1.00");
    }
  });

  it("reuses an existing lock ceiling without recreating it", async () => {
    const { tx, state } = createMockBuyingPowerTx({
      wallets: [{ companyId, availableBalance: 15_000 }],
      locks: [
        {
          companyId,
          amount: 10_000,
          buyingPowerCeiling: calculateBuyingPowerCeiling(10_000),
        },
      ],
      summaries: [{ companyId, activeBidsTotal: 0 }],
    });

    const result = await acquireOrVerifyBuyingPowerLock(tx, companyId, new Prisma.Decimal(100_000));

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.ceiling.toFixed(2)).toBe("600000.00");
    }
    expect(state.locks.get(companyId)?.amount.toFixed(2)).toBe("10000.00");
  });
});

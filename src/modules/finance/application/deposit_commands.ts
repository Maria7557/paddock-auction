import { randomUUID } from "node:crypto";

import { DomainConflictError, DomainNotFoundError } from "../../../lib/domain_errors";
import type { PrismaDecimal, PrismaTransaction } from "../../../lib/prisma";

const BUYING_POWER_WALLET_CURRENCY = "AED";
const MINIMUM_REQUIRED_DEPOSIT_AED = 5_000;
const DEFAULT_BUYING_POWER_CEILING_AED = 300_000;

export const BUYER_BID_SUMMARY_NOT_FOUND_CODE = "BUYER_BID_SUMMARY_NOT_FOUND";
export const BUYING_POWER_BID_AMOUNT_INVALID_CODE = "BUYING_POWER_BID_AMOUNT_INVALID";
export const BUYING_POWER_ACTIVE_BIDS_NEGATIVE_CODE = "BUYING_POWER_ACTIVE_BIDS_NEGATIVE";
export const BUYING_POWER_BID_AMOUNT_MISSING_CODE = "BUYING_POWER_BID_AMOUNT_MISSING";

export type BuyingPowerRejectionReason = "INSUFFICIENT_DEPOSIT" | "CEILING_EXCEEDED";

export type BuyingPowerGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: BuyingPowerRejectionReason;
    };

type LockedDepositWalletRow = {
  id: string;
  company_id: string;
  available_balance: PrismaDecimal;
  locked_balance: PrismaDecimal;
  pending_withdrawal_balance: PrismaDecimal;
};

type LockedDepositLockRow = {
  id: string;
  company_id: string | null;
  auction_id: string | null;
  amount: PrismaDecimal;
  buying_power_ceiling: PrismaDecimal;
  status: "ACTIVE" | "RELEASED" | "BURNED";
  created_at: Date;
  released_at: Date | null;
  burned_at: Date | null;
};

type LockedBuyerBidSummaryRow = {
  id: string;
  company_id: string;
  active_bids_total: PrismaDecimal;
  updated_at: Date;
};

type LockedBuyingPowerState = {
  wallet: LockedDepositWalletRow | null;
  activeLock: LockedDepositLockRow | null;
  summary: LockedBuyerBidSummaryRow | null;
};

function assertPositiveMoney(amount: PrismaDecimal, fieldName: string): void {
  if (amount.lessThanOrEqualTo(0)) {
    throw new DomainConflictError(
      BUYING_POWER_BID_AMOUNT_INVALID_CODE,
      `${fieldName} must be greater than zero`,
    );
  }
}

function calculateBuyingPowerCeiling(lockAmount: PrismaDecimal): PrismaDecimal {
  return lockAmount
    .dividedBy(MINIMUM_REQUIRED_DEPOSIT_AED)
    .times(DEFAULT_BUYING_POWER_CEILING_AED);
}

async function lockDepositWalletRow(
  tx: PrismaTransaction,
  companyId: string,
): Promise<LockedDepositWalletRow | null> {
  const rows = await tx.$queryRaw<LockedDepositWalletRow[]>`
    SELECT
      id,
      company_id,
      available_balance,
      locked_balance,
      pending_withdrawal_balance
    FROM deposit_wallets
    WHERE company_id = ${companyId}
      AND currency = ${BUYING_POWER_WALLET_CURRENCY}
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

async function lockActiveDepositLockRow(
  tx: PrismaTransaction,
  companyId: string,
): Promise<LockedDepositLockRow | null> {
  const rows = await tx.$queryRaw<LockedDepositLockRow[]>`
    SELECT
      id,
      company_id,
      auction_id,
      amount,
      buying_power_ceiling,
      status,
      created_at,
      released_at,
      burned_at
    FROM deposit_locks
    WHERE company_id = ${companyId}
      AND status = 'ACTIVE'
    ORDER BY created_at ASC
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

async function lockBuyerBidSummaryRow(
  tx: PrismaTransaction,
  companyId: string,
): Promise<LockedBuyerBidSummaryRow | null> {
  const rows = await tx.$queryRaw<LockedBuyerBidSummaryRow[]>`
    SELECT
      id,
      company_id,
      active_bids_total,
      updated_at
    FROM buyer_bid_summaries
    WHERE company_id = ${companyId}
    FOR UPDATE
  `;

  return rows[0] ?? null;
}

async function lockBuyingPowerState(
  tx: PrismaTransaction,
  companyId: string,
): Promise<LockedBuyingPowerState> {
  const wallet = await lockDepositWalletRow(tx, companyId);
  const activeLock = await lockActiveDepositLockRow(tx, companyId);
  const summary = await lockBuyerBidSummaryRow(tx, companyId);

  return {
    wallet,
    activeLock,
    summary,
  };
}

async function createActiveBuyingPowerLock(
  tx: PrismaTransaction,
  companyId: string,
  lockAmount: PrismaDecimal,
): Promise<LockedDepositLockRow> {
  const buyingPowerCeiling = calculateBuyingPowerCeiling(lockAmount);
  const rows = await tx.$queryRaw<LockedDepositLockRow[]>`
    INSERT INTO deposit_locks (
      id,
      company_id,
      auction_id,
      amount,
      buying_power_ceiling,
      status,
      created_at
    ) VALUES (
      ${randomUUID()},
      ${companyId},
      ${null},
      ${lockAmount},
      ${buyingPowerCeiling},
      'ACTIVE',
      NOW()
    )
    RETURNING
      id,
      company_id,
      auction_id,
      amount,
      buying_power_ceiling,
      status,
      created_at,
      released_at,
      burned_at
  `;

  return rows[0];
}

function requireBuyerBidSummary(
  summary: LockedBuyerBidSummaryRow | null,
  companyId: string,
): LockedBuyerBidSummaryRow {
  if (summary !== null) {
    return summary;
  }

  throw new DomainNotFoundError(
    BUYER_BID_SUMMARY_NOT_FOUND_CODE,
    `Buyer bid summary was not found for company ${companyId}`,
  );
}

async function setActiveBidsTotal(
  tx: PrismaTransaction,
  companyId: string,
  nextTotal: PrismaDecimal | number,
): Promise<void> {
  await tx.buyerBidSummary.update({
    where: {
      companyId,
    },
    data: {
      activeBidsTotal: nextTotal,
    },
  });
}

function assertActiveBidsCoversAmount(
  currentTotal: PrismaDecimal,
  amount: PrismaDecimal,
  companyId: string,
  context: string,
): void {
  if (!currentTotal.lessThan(amount)) {
    return;
  }

  throw new DomainConflictError(
    BUYING_POWER_ACTIVE_BIDS_NEGATIVE_CODE,
    `Active bids total cannot go negative for company ${companyId} while ${context}`,
  );
}

async function enqueueBuyerOutbidEvent(
  tx: PrismaTransaction,
  previousLeaderCompanyId: string,
  outbidAmount: PrismaDecimal,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      id: randomUUID(),
      aggregateType: "BUYER_BID_SUMMARY",
      aggregateId: previousLeaderCompanyId,
      eventType: "BUYER_OUTBID",
      partitionKey: previousLeaderCompanyId,
      payload: {
        type: "BUYER_OUTBID",
        companyId: previousLeaderCompanyId,
        auctionId: null,
        amount: outbidAmount.toFixed(2),
      },
    },
  });
}

export async function initializeBuyerBidSummary(
  tx: PrismaTransaction,
  companyId: string,
): Promise<void> {
  await lockDepositWalletRow(tx, companyId);
  await lockActiveDepositLockRow(tx, companyId);

  await tx.buyerBidSummary.upsert({
    where: {
      companyId,
    },
    update: {},
    create: {
      companyId,
      activeBidsTotal: 0,
    },
  });
}

export async function acquireOrVerifyBuyingPowerLock(
  tx: PrismaTransaction,
  companyId: string,
  bidAmount: PrismaDecimal,
): Promise<BuyingPowerGateResult> {
  assertPositiveMoney(bidAmount, "bidAmount");

  const wallet = await lockDepositWalletRow(tx, companyId);

  if (wallet === null || wallet.available_balance.lessThan(MINIMUM_REQUIRED_DEPOSIT_AED)) {
    return {
      allowed: false,
      reason: "INSUFFICIENT_DEPOSIT",
    };
  }

  let activeLock = await lockActiveDepositLockRow(tx, companyId);

  if (activeLock === null) {
    activeLock = await createActiveBuyingPowerLock(tx, companyId, wallet.available_balance);
  }

  const summary = requireBuyerBidSummary(await lockBuyerBidSummaryRow(tx, companyId), companyId);
  const newTotal = summary.active_bids_total.plus(bidAmount);

  if (newTotal.greaterThan(activeLock.buying_power_ceiling)) {
    return {
      allowed: false,
      reason: "CEILING_EXCEEDED",
    };
  }

  return {
    allowed: true,
  };
}

export async function recordLeadingBid(
  tx: PrismaTransaction,
  companyId: string,
  bidAmount: PrismaDecimal,
): Promise<void> {
  assertPositiveMoney(bidAmount, "bidAmount");

  const { summary } = await lockBuyingPowerState(tx, companyId);
  const lockedSummary = requireBuyerBidSummary(summary, companyId);

  await setActiveBidsTotal(tx, companyId, lockedSummary.active_bids_total.plus(bidAmount));
}

export async function releaseLeadingBidOnOutbid(
  tx: PrismaTransaction,
  previousLeaderCompanyId: string,
  outbidAmount: PrismaDecimal,
): Promise<void> {
  assertPositiveMoney(outbidAmount, "outbidAmount");

  const { summary } = await lockBuyingPowerState(tx, previousLeaderCompanyId);
  const lockedSummary = requireBuyerBidSummary(summary, previousLeaderCompanyId);

  assertActiveBidsCoversAmount(
    lockedSummary.active_bids_total,
    outbidAmount,
    previousLeaderCompanyId,
    "releasing an outbid leading bid",
  );

  await setActiveBidsTotal(
    tx,
    previousLeaderCompanyId,
    lockedSummary.active_bids_total.minus(outbidAmount),
  );
  await enqueueBuyerOutbidEvent(tx, previousLeaderCompanyId, outbidAmount);
}

export async function releaseAuctionBidsFromBuyingPower(
  tx: PrismaTransaction,
  auctionId: string,
  losingCompanyIds: string[],
  bidAmountsByCompany: Map<string, PrismaDecimal>,
): Promise<void> {
  const orderedCompanyIds = [...new Set(losingCompanyIds)].sort((left, right) => left.localeCompare(right));

  for (const companyId of orderedCompanyIds) {
    const bidAmount = bidAmountsByCompany.get(companyId);

    if (!bidAmount) {
      throw new DomainNotFoundError(
        BUYING_POWER_BID_AMOUNT_MISSING_CODE,
        `Bid amount was not provided for losing company ${companyId} on auction ${auctionId}`,
      );
    }

    assertPositiveMoney(bidAmount, "bidAmountsByCompany");

    const { summary } = await lockBuyingPowerState(tx, companyId);
    const lockedSummary = requireBuyerBidSummary(summary, companyId);

    assertActiveBidsCoversAmount(
      lockedSummary.active_bids_total,
      bidAmount,
      companyId,
      `releasing losing bids for auction ${auctionId}`,
    );

    await setActiveBidsTotal(tx, companyId, lockedSummary.active_bids_total.minus(bidAmount));
  }
}

export async function releaseWinnerBidAfterPayment(
  tx: PrismaTransaction,
  winnerCompanyId: string,
  winningBidAmount: PrismaDecimal,
): Promise<void> {
  assertPositiveMoney(winningBidAmount, "winningBidAmount");

  const { activeLock, summary } = await lockBuyingPowerState(tx, winnerCompanyId);
  const lockedSummary = requireBuyerBidSummary(summary, winnerCompanyId);
  const unclampedTotal = lockedSummary.active_bids_total.minus(winningBidAmount);
  const clampedTotal = unclampedTotal.lessThan(0)
    ? lockedSummary.active_bids_total.minus(lockedSummary.active_bids_total)
    : unclampedTotal;

  await setActiveBidsTotal(tx, winnerCompanyId, clampedTotal);

  if (activeLock !== null && clampedTotal.lessThanOrEqualTo(0)) {
    await tx.depositLock.updateMany({
      where: {
        companyId: winnerCompanyId,
        status: "ACTIVE",
      },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
      },
    });
  }
}

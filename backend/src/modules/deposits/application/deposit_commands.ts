import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

const BUYING_POWER_WALLET_CURRENCY = "AED";
const MINIMUM_REQUIRED_DEPOSIT_AED = new Prisma.Decimal(5_000);
const DEFAULT_BUYING_POWER_CEILING_AED = new Prisma.Decimal(300_000);
const ZERO_DECIMAL = new Prisma.Decimal(0);

type Decimal = Prisma.Decimal;

export const BUYER_BID_SUMMARY_NOT_FOUND_CODE = "BUYER_BID_SUMMARY_NOT_FOUND";
export const BUYING_POWER_BID_AMOUNT_INVALID_CODE = "BUYING_POWER_BID_AMOUNT_INVALID";
export const BUYING_POWER_ACTIVE_BIDS_NEGATIVE_CODE = "BUYING_POWER_ACTIVE_BIDS_NEGATIVE";
export const BUYING_POWER_BID_AMOUNT_MISSING_CODE = "BUYING_POWER_BID_AMOUNT_MISSING";

export class BuyingPowerCommandError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BuyingPowerCommandError";
    this.code = code;
    this.details = details;
  }
}

export type BuyingPowerRejectionReason = "INSUFFICIENT_DEPOSIT" | "CEILING_EXCEEDED";

export type BuyingPowerGateResult =
  | {
      allowed: true;
      currentTotal: Decimal;
      ceiling: Decimal;
      remaining: Decimal;
    }
  | {
      allowed: false;
      reason: BuyingPowerRejectionReason;
      currentTotal: Decimal;
      ceiling: Decimal;
      requested: Decimal;
      shortfall: Decimal;
    };

type TxClient = Prisma.TransactionClient;

type LockedDepositWalletRow = {
  id: string;
  company_id: string;
  available_balance: Decimal;
  locked_balance: Decimal;
  pending_withdrawal_balance: Decimal;
};

type LockedDepositLockRow = {
  id: string;
  company_id: string | null;
  auction_id: string | null;
  amount: Decimal;
  buying_power_ceiling: Decimal;
  status: "ACTIVE" | "RELEASED" | "BURNED";
  created_at: Date;
  released_at: Date | null;
  burned_at: Date | null;
};

type LockedBuyerBidSummaryRow = {
  id: string;
  company_id: string;
  active_bids_total: Decimal;
  updated_at: Date;
};

type LockedBuyingPowerState = {
  wallet: LockedDepositWalletRow | null;
  activeLock: LockedDepositLockRow | null;
  summary: LockedBuyerBidSummaryRow | null;
};

type PrimeBuyingPowerStateOptions = {
  initializeSummary?: boolean;
};

export type BuyingPowerSnapshot = {
  activeBidsTotal: Decimal;
  ceiling: Decimal;
  remaining: Decimal;
};

const buyingPowerStateCache = new WeakMap<TxClient, Map<string, LockedBuyingPowerState>>();

function getBuyingPowerStateMap(tx: TxClient): Map<string, LockedBuyingPowerState> {
  const existing = buyingPowerStateCache.get(tx);

  if (existing) {
    return existing;
  }

  const created = new Map<string, LockedBuyingPowerState>();
  buyingPowerStateCache.set(tx, created);
  return created;
}

function setCachedBuyingPowerState(
  tx: TxClient,
  companyId: string,
  state: LockedBuyingPowerState,
): LockedBuyingPowerState {
  getBuyingPowerStateMap(tx).set(companyId, state);
  return state;
}

function getCachedBuyingPowerState(
  tx: TxClient,
  companyId: string,
): LockedBuyingPowerState | null {
  return getBuyingPowerStateMap(tx).get(companyId) ?? null;
}

function assertPositiveMoney(amount: Decimal, fieldName: string): void {
  if (amount.lessThanOrEqualTo(ZERO_DECIMAL)) {
    throw new BuyingPowerCommandError(
      BUYING_POWER_BID_AMOUNT_INVALID_CODE,
      `${fieldName} must be greater than zero`,
      {
        fieldName,
        amount: amount.toFixed(2),
      },
    );
  }
}

function calculateBuyingPowerCeiling(lockAmount: Decimal): Decimal {
  return lockAmount
    .dividedBy(MINIMUM_REQUIRED_DEPOSIT_AED)
    .times(DEFAULT_BUYING_POWER_CEILING_AED);
}

async function lockDepositWalletRow(
  tx: TxClient,
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
  tx: TxClient,
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
  tx: TxClient,
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

function requireBuyerBidSummary(
  summary: LockedBuyerBidSummaryRow | null,
  companyId: string,
): LockedBuyerBidSummaryRow {
  if (summary !== null) {
    return summary;
  }

  throw new BuyingPowerCommandError(
    BUYER_BID_SUMMARY_NOT_FOUND_CODE,
    `Buyer bid summary was not found for company ${companyId}`,
    {
      companyId,
    },
  );
}

function buildSnapshot(
  activeBidsTotal: Decimal,
  ceiling: Decimal,
): BuyingPowerSnapshot {
  const remaining = ceiling.minus(activeBidsTotal);

  return {
    activeBidsTotal,
    ceiling,
    remaining: remaining.lessThan(ZERO_DECIMAL) ? ZERO_DECIMAL : remaining,
  };
}

async function updateBuyerBidSummaryTotal(
  tx: TxClient,
  companyId: string,
  nextTotal: Decimal,
): Promise<LockedBuyerBidSummaryRow> {
  const rows = await tx.$queryRaw<LockedBuyerBidSummaryRow[]>`
    UPDATE buyer_bid_summaries
    SET active_bids_total = ${nextTotal},
        updated_at = NOW()
    WHERE company_id = ${companyId}
    RETURNING
      id,
      company_id,
      active_bids_total,
      updated_at
  `;

  const updatedSummary = rows[0];

  if (!updatedSummary) {
    throw new BuyingPowerCommandError(
      BUYER_BID_SUMMARY_NOT_FOUND_CODE,
      `Buyer bid summary was not found for company ${companyId}`,
      {
        companyId,
      },
    );
  }

  return updatedSummary;
}

async function createActiveBuyingPowerLock(
  tx: TxClient,
  companyId: string,
  lockAmount: Decimal,
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

  const createdLock = rows[0];

  if (!createdLock) {
    throw new BuyingPowerCommandError(
      "BUYING_POWER_LOCK_CREATE_FAILED",
      `Unable to create buying power lock for company ${companyId}`,
      {
        companyId,
      },
    );
  }

  return createdLock;
}

export async function primeBuyingPowerState(
  tx: TxClient,
  companyId: string,
  options: PrimeBuyingPowerStateOptions = {},
): Promise<LockedBuyingPowerState> {
  const cachedState = getCachedBuyingPowerState(tx, companyId);

  if (cachedState) {
    return cachedState;
  }

  const wallet = await lockDepositWalletRow(tx, companyId);
  const activeLock = await lockActiveDepositLockRow(tx, companyId);
  let summary = await lockBuyerBidSummaryRow(tx, companyId);

  if (summary === null && options.initializeSummary === true) {
    await tx.$executeRaw`
      INSERT INTO buyer_bid_summaries (
        id,
        company_id,
        active_bids_total,
        updated_at
      ) VALUES (
        ${randomUUID()},
        ${companyId},
        ${ZERO_DECIMAL},
        NOW()
      )
      ON CONFLICT (company_id) DO NOTHING
    `;

    summary = await lockBuyerBidSummaryRow(tx, companyId);
  }

  return setCachedBuyingPowerState(tx, companyId, {
    wallet,
    activeLock,
    summary,
  });
}

export async function readBuyingPowerSnapshot(
  tx: TxClient,
  companyId: string,
): Promise<BuyingPowerSnapshot> {
  const state = await primeBuyingPowerState(tx, companyId, {
    initializeSummary: true,
  });
  const summary = requireBuyerBidSummary(state.summary, companyId);
  const ceiling = state.activeLock?.buying_power_ceiling ?? DEFAULT_BUYING_POWER_CEILING_AED;

  return buildSnapshot(summary.active_bids_total, ceiling);
}

async function applyActiveBidDelta(
  tx: TxClient,
  companyId: string,
  delta: Decimal,
  context: string,
): Promise<BuyingPowerSnapshot> {
  const state = await primeBuyingPowerState(tx, companyId);
  const summary = requireBuyerBidSummary(state.summary, companyId);
  const nextTotal = summary.active_bids_total.plus(delta);

  if (nextTotal.lessThan(ZERO_DECIMAL)) {
    throw new BuyingPowerCommandError(
      BUYING_POWER_ACTIVE_BIDS_NEGATIVE_CODE,
      `Active bids total cannot go negative for company ${companyId} while ${context}`,
      {
        companyId,
        context,
        currentTotal: summary.active_bids_total.toFixed(2),
        delta: delta.toFixed(2),
      },
    );
  }

  const updatedSummary = await updateBuyerBidSummaryTotal(tx, companyId, nextTotal);
  const nextState: LockedBuyingPowerState = {
    ...state,
    summary: updatedSummary,
  };

  setCachedBuyingPowerState(tx, companyId, nextState);

  return buildSnapshot(
    updatedSummary.active_bids_total,
    nextState.activeLock?.buying_power_ceiling ?? DEFAULT_BUYING_POWER_CEILING_AED,
  );
}

export async function initializeBuyerBidSummary(
  tx: TxClient,
  companyId: string,
): Promise<void> {
  await primeBuyingPowerState(tx, companyId, {
    initializeSummary: true,
  });
}

export async function acquireOrVerifyBuyingPowerLock(
  tx: TxClient,
  companyId: string,
  bidAmount: Decimal,
): Promise<BuyingPowerGateResult> {
  assertPositiveMoney(bidAmount, "bidAmount");

  const state = await primeBuyingPowerState(tx, companyId, {
    initializeSummary: true,
  });
  const summary = requireBuyerBidSummary(state.summary, companyId);

  if (state.wallet === null || state.wallet.available_balance.lessThan(MINIMUM_REQUIRED_DEPOSIT_AED)) {
    return {
      allowed: false,
      reason: "INSUFFICIENT_DEPOSIT",
      currentTotal: summary.active_bids_total,
      ceiling: state.activeLock?.buying_power_ceiling ?? DEFAULT_BUYING_POWER_CEILING_AED,
      requested: bidAmount,
      shortfall: MINIMUM_REQUIRED_DEPOSIT_AED,
    };
  }

  let activeLock = state.activeLock;

  if (activeLock === null) {
    activeLock = await createActiveBuyingPowerLock(tx, companyId, state.wallet.available_balance);
    setCachedBuyingPowerState(tx, companyId, {
      ...state,
      activeLock,
    });
  }

  const nextTotal = summary.active_bids_total.plus(bidAmount);

  if (nextTotal.greaterThan(activeLock.buying_power_ceiling)) {
    return {
      allowed: false,
      reason: "CEILING_EXCEEDED",
      currentTotal: summary.active_bids_total,
      ceiling: activeLock.buying_power_ceiling,
      requested: bidAmount,
      shortfall: nextTotal.minus(activeLock.buying_power_ceiling),
    };
  }

  return {
    allowed: true,
    currentTotal: summary.active_bids_total,
    ceiling: activeLock.buying_power_ceiling,
    remaining: activeLock.buying_power_ceiling.minus(nextTotal),
  };
}

export async function recordLeadingBid(
  tx: TxClient,
  companyId: string,
  bidAmount: Decimal,
): Promise<BuyingPowerSnapshot> {
  assertPositiveMoney(bidAmount, "bidAmount");

  return applyActiveBidDelta(tx, companyId, bidAmount, "recording a leading bid");
}

export async function releaseLeadingBidOnOutbid(
  tx: TxClient,
  previousLeaderCompanyId: string,
  outbidAmount: Decimal,
): Promise<BuyingPowerSnapshot> {
  assertPositiveMoney(outbidAmount, "outbidAmount");

  const snapshot = await applyActiveBidDelta(
    tx,
    previousLeaderCompanyId,
    outbidAmount.negated(),
    "releasing an outbid leading bid",
  );

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

  return snapshot;
}

export async function releaseAuctionBidsFromBuyingPower(
  tx: TxClient,
  auctionId: string,
  losingCompanyIds: string[],
  bidAmountsByCompany: Map<string, Decimal>,
): Promise<void> {
  const orderedCompanyIds = [...new Set(losingCompanyIds)].sort((left, right) =>
    left.localeCompare(right),
  );

  for (const companyId of orderedCompanyIds) {
    const bidAmount = bidAmountsByCompany.get(companyId);

    if (!bidAmount) {
      throw new BuyingPowerCommandError(
        BUYING_POWER_BID_AMOUNT_MISSING_CODE,
        `Bid amount was not provided for losing company ${companyId} on auction ${auctionId}`,
        {
          auctionId,
          companyId,
        },
      );
    }

    assertPositiveMoney(bidAmount, "bidAmountsByCompany");

    await applyActiveBidDelta(
      tx,
      companyId,
      bidAmount.negated(),
      `releasing losing bids for auction ${auctionId}`,
    );
  }
}

export async function releaseWinnerBidAfterPayment(
  tx: TxClient,
  winnerCompanyId: string,
  winningBidAmount: Decimal,
): Promise<BuyingPowerSnapshot> {
  assertPositiveMoney(winningBidAmount, "winningBidAmount");

  const snapshot = await applyActiveBidDelta(
    tx,
    winnerCompanyId,
    winningBidAmount.negated(),
    "releasing a paid winning bid",
  );

  if (snapshot.activeBidsTotal.equals(ZERO_DECIMAL)) {
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

    const state = await primeBuyingPowerState(tx, winnerCompanyId);

    setCachedBuyingPowerState(tx, winnerCompanyId, {
      ...state,
      activeLock: null,
    });
  }

  return snapshot;
}

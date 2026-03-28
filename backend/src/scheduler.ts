import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import Redis from "ioredis";
import type { ScheduledTask } from "node-cron";
import cron from "node-cron";

import { prisma } from "./db";
import { releaseAuctionDepositLocks } from "./lib/auction-deposit-locks";
import {
  sendNewVehiclesDigestEmail,
  sendPaymentDeadlineReminderEmail,
  sendSellerAuctionReminderEmail,
  sendWatchlistAuctionReminderEmail,
} from "./lib/email";
import { checkAndTick, startEvent } from "./lib/event-orchestrator";
import {
  collectAuctionCloseBuyingPowerOutcome,
  releaseBuyingPowerForClosedAuction,
} from "./modules/auction/application/close_auction";
import { releaseAuctionBidsFromBuyingPower } from "./modules/deposits/application/deposit_commands";

type DecimalLike =
  | number
  | string
  | bigint
  | null
  | undefined
  | {
      toNumber?: () => number;
      valueOf?: () => unknown;
      toString?: () => string;
    };

type LoggerLike = {
  info: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

type ExpiredAuctionRow = {
  id: string;
  version: number;
  state: "LIVE" | "EXTENDED";
  seller_company_id: string;
  current_price: DecimalLike;
};

type DueDeadlineRow = {
  id: string;
  auction_id: string;
  buyer_company_id: string;
};

type DueSellerDecisionRow = {
  id: string;
  seller_company_id: string;
  winner_company_id: string | null;
  current_price: DecimalLike;
};

const schedulerActorId = "system:scheduler";
const scheduledTasks: ScheduledTask[] = [];
const schedulerTimezone = "Asia/Dubai";
const localReminderDedup = new Map<string, number>();

let schedulerStarted = false;
let schedulerLogger: LoggerLike = {
  info(payload: unknown, message?: string): void {
    if (message) {
      console.info(message, payload);
      return;
    }

    console.info(payload);
  },
  error(payload: unknown, message?: string): void {
    if (message) {
      console.error(message, payload);
      return;
    }

    console.error(payload);
  },
};
let reminderRedisClient: Redis | null = null;
let reminderRedisPromise: Promise<Redis | null> | null = null;

function getRedisUrl(): string | null {
  const value = process.env.REDIS_URL?.trim();

  return value ? value : null;
}

function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: null,
  });

  client.on("error", () => {
    // Reminder deduplication is best-effort and must never crash the scheduler.
  });

  return client;
}

async function ensureReminderRedisClient(): Promise<Redis | null> {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (reminderRedisClient) {
    return reminderRedisClient;
  }

  if (reminderRedisPromise) {
    return reminderRedisPromise;
  }

  reminderRedisPromise = (async () => {
    const client = createRedisClient(redisUrl);

    try {
      await client.connect();
      reminderRedisClient = client;
      return client;
    } catch {
      client.disconnect(false);
      return null;
    } finally {
      reminderRedisPromise = null;
    }
  })();

  return reminderRedisPromise;
}

async function safeCloseReminderRedisClient(): Promise<void> {
  if (!reminderRedisClient) {
    return;
  }

  try {
    await reminderRedisClient.quit();
  } catch {
    reminderRedisClient.disconnect(false);
  } finally {
    reminderRedisClient = null;
    reminderRedisPromise = null;
  }
}

async function claimReminderKey(key: string, ttlSeconds: number): Promise<boolean> {
  const now = Date.now();

  for (const [entryKey, expiresAt] of localReminderDedup.entries()) {
    if (expiresAt <= now) {
      localReminderDedup.delete(entryKey);
    }
  }

  const client = await ensureReminderRedisClient();

  if (client) {
    try {
      const result = await client.set(key, "1", "EX", ttlSeconds, "NX");

      return result === "OK";
    } catch {
      // Fall back to in-memory dedup below.
    }
  }

  const existingExpiry = localReminderDedup.get(key);

  if (existingExpiry && existingExpiry > now) {
    return false;
  }

  localReminderDedup.set(key, now + ttlSeconds * 1_000);

  return true;
}

async function addHours(base: Date, hours: number): Promise<Date> {
  const next = new Date(base);

  next.setUTCHours(next.getUTCHours() + hours);

  return next;
}

async function toNumberValue(value: DecimalLike): Promise<number> {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  if (value && typeof value === "object" && typeof value.valueOf === "function") {
    const rawValue = value.valueOf();

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      const parsed = Number(rawValue);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  if (value && typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("Unable to convert value to number");
}

async function createAuditLog(
  tx: {
    auditLog: {
      create: (input: {
        data: {
          actorId: string;
          action: string;
          entityType: string;
          entityId: string;
          payloadHash: string;
          payload: Prisma.InputJsonValue;
        };
      }) => Promise<unknown>;
    };
  },
  input: {
    action: string;
    entityType: string;
    entityId: string;
    payload: Prisma.InputJsonValue;
  },
): Promise<void> {
  const payloadHashHex = createHash("sha256")
    .update(JSON.stringify(input.payload))
    .digest("hex");

  await tx.auditLog.create({
    data: {
      actorId: schedulerActorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payloadHash: payloadHashHex,
      payload: JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue,
    },
  });
}

async function processExpiredAuctionsBatch(): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const expired = await tx.$queryRaw<ExpiredAuctionRow[]>`
        SELECT id, version, state, seller_company_id, current_price
        FROM auctions
        WHERE state IN ('LIVE', 'EXTENDED')
          AND ends_at < NOW()
        FOR UPDATE SKIP LOCKED
        LIMIT 10
      `;

      let processed = 0;

      for (const auction of expired) {
        const closeOutcome = await collectAuctionCloseBuyingPowerOutcome(tx, auction.id);
        const nextState = closeOutcome.winnerCompanyId ? "AWAITING_SELLER_DECISION" : "ENDED";
        const decisionDeadlineAt = closeOutcome.winnerCompanyId ? await addHours(new Date(), 24) : null;
        const updateResult = await tx.$executeRaw`
          UPDATE auctions
          SET state = ${nextState}::"AuctionState",
              winner_company_id = ${closeOutcome.winnerCompanyId},
              decision_deadline_at = ${decisionDeadlineAt},
              seller_decision = NULL,
              seller_decided_at = NULL,
              seller_decided_by = NULL,
              closed_at = NOW(),
              version = version + 1,
              updated_at = NOW()
          WHERE id = ${auction.id}
            AND version = ${auction.version}
        `;

        if (updateResult === 0) {
          continue;
        }

        await tx.auctionStateTransition.create({
          data: {
            auctionId: auction.id,
            fromState: auction.state,
            toState: nextState,
            trigger: "scheduler_close",
            actorId: schedulerActorId,
            reason: JSON.stringify({
              winnerCompanyId: closeOutcome.winnerCompanyId,
            }),
          },
        });

        await releaseBuyingPowerForClosedAuction(tx, closeOutcome);

        processed += 1;
      }

      return processed;
    },
    {
      isolationLevel: "Serializable",
    },
  );
}

async function processExpiredSellerDecisionBatch(): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const auctions = await tx.$queryRaw<DueSellerDecisionRow[]>`
        SELECT id, seller_company_id, winner_company_id, current_price
        FROM auctions
        WHERE state = 'AWAITING_SELLER_DECISION'
          AND decision_deadline_at < NOW()
          AND seller_decision IS NULL
        FOR UPDATE SKIP LOCKED
        LIMIT 20
      `;

      let processed = 0;

      for (const auction of auctions) {
        const now = new Date();

        await releaseAuctionDepositLocks(tx, {
          auctionId: auction.id,
          reason: "SELLER_DECISION_EXPIRED",
        });

        if (auction.winner_company_id) {
          await releaseAuctionBidsFromBuyingPower(
            tx,
            auction.id,
            [auction.winner_company_id],
            new Map([
              [
                auction.winner_company_id,
                new Prisma.Decimal((await toNumberValue(auction.current_price)).toFixed(2)),
              ],
            ]),
          );
        }

        await tx.auction.update({
          where: {
            id: auction.id,
          },
          data: {
            state: "RELISTED",
            sellerDecision: "expired",
            sellerDecidedAt: now,
            sellerDecidedBy: null,
          },
        });

        await tx.auctionStateTransition.create({
          data: {
            auctionId: auction.id,
            fromState: "AWAITING_SELLER_DECISION",
            toState: "RELISTED",
            trigger: "DECISION_DEADLINE_EXPIRED",
            actorId: schedulerActorId,
            reason: JSON.stringify({
              sellerCompanyId: auction.seller_company_id,
              buyerCompanyId: auction.winner_company_id,
            }),
          },
        });

        await createAuditLog(tx, {
          action: "SELLER_DECISION_EXPIRED",
          entityType: "Auction",
          entityId: auction.id,
          payload: {
            auctionId: auction.id,
            previousState: "AWAITING_SELLER_DECISION",
            nextState: "RELISTED",
            sellerCompanyId: auction.seller_company_id,
            buyerCompanyId: auction.winner_company_id,
            decision: "expired",
          },
        });

        processed += 1;
      }

      return processed;
    },
    {
      isolationLevel: "Serializable",
    },
  );
}

async function processDuePaymentDeadlinesBatch(): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const deadlines = await tx.$queryRaw<DueDeadlineRow[]>`
        SELECT id, auction_id, buyer_company_id
        FROM payment_deadlines
        WHERE status = 'ACTIVE'
          AND due_at < NOW()
        FOR UPDATE SKIP LOCKED
        LIMIT 10
      `;

      let processed = 0;

      for (const deadline of deadlines) {
        const auction = await tx.auction.findUnique({
          where: {
            id: deadline.auction_id,
          },
          select: {
            id: true,
            state: true,
            version: true,
            winnerCompanyId: true,
          },
        });

        const invoice = await tx.invoice.findUnique({
          where: {
            auctionId: deadline.auction_id,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (invoice?.status === "PAID") {
          await tx.paymentDeadline.update({
            where: {
              id: deadline.id,
            },
            data: {
              status: "PAID",
              resolvedAt: new Date(),
            },
          });

          processed += 1;
          continue;
        }

        await tx.paymentDeadline.update({
          where: {
            id: deadline.id,
          },
          data: {
            status: "DEFAULTED",
            escalatedFlag: true,
            resolvedAt: new Date(),
          },
        });

        if (invoice?.status === "ISSUED") {
          await tx.invoice.update({
            where: {
              id: invoice.id,
            },
            data: {
              status: "DEFAULTED",
            },
          });
        }

        if (auction && auction.state === "PAYMENT_PENDING") {
          const updateResult = await tx.$executeRaw`
            UPDATE auctions
            SET state = ${"DEFAULTED"}::"AuctionState",
                winner_company_id = NULL,
                version = version + 1,
                updated_at = NOW()
            WHERE id = ${auction.id}
              AND version = ${auction.version}
          `;

          if (updateResult > 0) {
            await tx.auctionStateTransition.create({
              data: {
                auctionId: auction.id,
                fromState: "PAYMENT_PENDING",
                toState: "DEFAULTED",
                trigger: "scheduler_enforce_payment_deadline",
                actorId: schedulerActorId,
                reason: JSON.stringify({
                  buyerCompanyId: deadline.buyer_company_id,
                }),
              },
            });
          }
        }

        await createAuditLog(tx, {
          action: "PAYMENT_DEADLINE_DEFAULTED",
          entityType: "PaymentDeadline",
          entityId: deadline.id,
          payload: {
            paymentDeadlineId: deadline.id,
            auctionId: deadline.auction_id,
            buyerCompanyId: deadline.buyer_company_id,
            invoiceId: invoice?.id ?? null,
            auctionState: auction?.state ?? null,
          },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: "AUCTION",
            aggregateId: deadline.auction_id,
            eventType: "PAYMENT_DEFAULTED",
            partitionKey: deadline.auction_id,
            payload: {
              type: "PAYMENT_DEFAULTED",
              paymentDeadlineId: deadline.id,
              auctionId: deadline.auction_id,
              buyerCompanyId: deadline.buyer_company_id,
              invoiceId: invoice?.id ?? null,
            },
          },
        });

        processed += 1;
      }

      return processed;
    },
    {
      isolationLevel: "Serializable",
    },
  );
}

export async function closeExpiredAuctions(): Promise<void> {
  const processed = await processExpiredAuctionsBatch();

  schedulerLogger.info(
    {
      job: "closeExpiredAuctions",
      processed,
    },
    "Scheduler job completed",
  );
}

export async function enforcePaymentDeadlines(): Promise<void> {
  const processed = await processDuePaymentDeadlinesBatch();

  schedulerLogger.info(
    {
      job: "enforcePaymentDeadlines",
      processed,
    },
    "Scheduler job completed",
  );
}

export async function runSellerDecisionDeadlineJob(): Promise<void> {
  const processed = await processExpiredSellerDecisionBatch();

  schedulerLogger.info(
    {
      job: "runSellerDecisionDeadlineJob",
      processed,
    },
    "Scheduler job completed",
  );
}

export async function runEventAutoStartJob(): Promise<void> {
  const dueEvents = await prisma.auctionEvent.findMany({
    where: {
      state: "SCHEDULED",
      scheduledAt: {
        lte: new Date(),
      },
    },
    select: {
      id: true,
    },
  });

  let processed = 0;

  for (const event of dueEvents) {
    try {
      await startEvent(event.id);
      processed += 1;
      schedulerLogger.info(
        {
          job: "runEventAutoStartJob",
          eventId: event.id,
        },
        "Event auto-started",
      );
    } catch (error) {
      schedulerLogger.error(
        {
          job: "runEventAutoStartJob",
          eventId: event.id,
          err: error instanceof Error ? error.message : String(error),
        },
        "Failed to auto-start event",
      );
    }
  }

  schedulerLogger.info(
    {
      job: "runEventAutoStartJob",
      processed,
    },
    "Scheduler job completed",
  );
}

export async function runEventTickJob(): Promise<void> {
  const liveEvents = await prisma.auctionEvent.findMany({
    where: {
      state: "LIVE",
    },
    select: {
      id: true,
    },
  });

  let processed = 0;

  for (const event of liveEvents) {
    try {
      await checkAndTick(event.id);
      processed += 1;
    } catch (error) {
      schedulerLogger.error(
        {
          job: "runEventTickJob",
          eventId: event.id,
          err: error instanceof Error ? error.message : String(error),
        },
        "Event tick failed",
      );
    }
  }

  schedulerLogger.info(
    {
      job: "runEventTickJob",
      processed,
    },
    "Scheduler job completed",
  );
}

export async function runPaymentDeadlineReminders(): Promise<void> {
  try {
    const now = new Date();
    const windows = [
      { hours: 24, minMs: 23.5 * 3_600_000, maxMs: 24.5 * 3_600_000 },
      { hours: 2, minMs: 1.75 * 3_600_000, maxMs: 2.25 * 3_600_000 },
    ];

    let processed = 0;

    for (const window of windows) {
      const from = new Date(now.getTime() + window.minMs);
      const to = new Date(now.getTime() + window.maxMs);
      const invoices = await prisma.invoice.findMany({
        where: {
          status: "ISSUED",
          dueAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          id: true,
          dueAt: true,
          total: true,
          buyerCompanyId: true,
          auctionId: true,
          auction: {
            select: {
              vehicle: {
                select: {
                  brand: true,
                  model: true,
                  year: true,
                },
              },
            },
          },
        },
      });

      for (const invoice of invoices) {
        const dedupKey = `reminder:payment:${invoice.id}:${window.hours}`;
        const shouldSend = await claimReminderKey(dedupKey, Math.ceil((window.hours + 2) * 3_600));

        if (!shouldSend) {
          continue;
        }

        const buyerUsers = await prisma.companyUser.findMany({
          where: {
            companyId: invoice.buyerCompanyId,
            role: "BUYER_BIDDER",
          },
          select: {
            user: {
              select: {
                email: true,
              },
            },
          },
          take: 1,
        });

        for (const buyerUser of buyerUsers) {
          void sendPaymentDeadlineReminderEmail(
            {
              email: buyerUser.user.email,
              name: buyerUser.user.email,
              vehicleTitle: `${invoice.auction.vehicle.brand} ${invoice.auction.vehicle.model} ${invoice.auction.vehicle.year}`,
              finalPriceAed: await toNumberValue(invoice.total),
              paymentDeadline: invoice.dueAt,
              hoursLeft: window.hours,
              invoiceId: invoice.id,
            },
            schedulerLogger,
          );
          processed += 1;
        }
      }
    }

    schedulerLogger.info(
      {
        job: "runPaymentDeadlineReminders",
        processed,
      },
      "Scheduler job completed",
    );
  } catch (error) {
    schedulerLogger.error(
      {
        job: "runPaymentDeadlineReminders",
        err: error instanceof Error ? error.message : String(error),
      },
      "Scheduler job failed",
    );
  }
}

export async function runWatchlistReminders(): Promise<void> {
  try {
    const now = new Date();
    const windows = [
      { label: "3 days", minMs: 71.5 * 3_600_000, maxMs: 72.5 * 3_600_000 },
      { label: "tomorrow", minMs: 23.5 * 3_600_000, maxMs: 24.5 * 3_600_000 },
      { label: "2 hours", minMs: 1.75 * 3_600_000, maxMs: 2.25 * 3_600_000 },
    ];

    let processed = 0;

    for (const window of windows) {
      const from = new Date(now.getTime() + window.minMs);
      const to = new Date(now.getTime() + window.maxMs);
      const auctions = await prisma.auction.findMany({
        where: {
          state: {
            in: ["SCHEDULED", "LIVE"],
          },
          startsAt: {
            gte: from,
            lte: to,
          },
          transitions: {
            none: {
              trigger: "EVENT_META",
            },
          },
        },
        select: {
          id: true,
          startsAt: true,
          startingPrice: true,
          vehicle: {
            select: {
              brand: true,
              model: true,
              year: true,
            },
          },
        },
      });

      for (const auction of auctions) {
        const watchlistEntries = await prisma.savedLot.findMany({
          where: {
            auctionId: auction.id,
          },
          select: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });

        for (const entry of watchlistEntries) {
          const dedupKey = `reminder:watchlist:${auction.id}:${window.label}:${entry.user.id}`;
          const shouldSend = await claimReminderKey(dedupKey, Math.ceil(window.maxMs / 1_000) + 3_600);

          if (!shouldSend) {
            continue;
          }

          void sendWatchlistAuctionReminderEmail(
            {
              email: entry.user.email,
              name: entry.user.email,
              vehicleTitle: `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.year}`,
              startsAt: auction.startsAt,
              startPriceAed: await toNumberValue(auction.startingPrice),
              auctionId: auction.id,
              timeLabel: window.label,
            },
            schedulerLogger,
          );
          processed += 1;
        }
      }
    }

    schedulerLogger.info(
      {
        job: "runWatchlistReminders",
        processed,
      },
      "Scheduler job completed",
    );
  } catch (error) {
    schedulerLogger.error(
      {
        job: "runWatchlistReminders",
        err: error instanceof Error ? error.message : String(error),
      },
      "Scheduler job failed",
    );
  }
}

export async function runSellerAuctionReminders(): Promise<void> {
  try {
    const now = new Date();
    const from = new Date(now.getTime() + 23.5 * 3_600_000);
    const to = new Date(now.getTime() + 24.5 * 3_600_000);
    const auctions = await prisma.auction.findMany({
      where: {
        state: "SCHEDULED",
        startsAt: {
          gte: from,
          lte: to,
        },
        transitions: {
          none: {
            trigger: "EVENT_META",
          },
        },
      },
      select: {
        id: true,
        startsAt: true,
        sellerCompanyId: true,
        vehicle: {
          select: {
            brand: true,
            model: true,
            year: true,
          },
        },
      },
    });

    let processed = 0;

    for (const auction of auctions) {
      const sellerUsers = await prisma.companyUser.findMany({
        where: {
          companyId: auction.sellerCompanyId,
          role: "SELLER_MANAGER",
        },
        select: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      for (const sellerUser of sellerUsers) {
        const dedupKey = `reminder:seller:${auction.id}:24h:${sellerUser.user.id}`;
        const shouldSend = await claimReminderKey(dedupKey, 30 * 3_600);

        if (!shouldSend) {
          continue;
        }

        void sendSellerAuctionReminderEmail(
          {
            email: sellerUser.user.email,
            name: sellerUser.user.email,
            vehicleTitle: `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.year}`,
            startsAt: auction.startsAt,
            auctionId: auction.id,
          },
          schedulerLogger,
        );
        processed += 1;
      }
    }

    schedulerLogger.info(
      {
        job: "runSellerAuctionReminders",
        processed,
      },
      "Scheduler job completed",
    );
  } catch (error) {
    schedulerLogger.error(
      {
        job: "runSellerAuctionReminders",
        err: error instanceof Error ? error.message : String(error),
      },
      "Scheduler job failed",
    );
  }
}

export async function runNewVehiclesDigest(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 4 * 24 * 3_600_000);
    const [totalCount, newAuctions] = await Promise.all([
      prisma.auction.count({
        where: {
          createdAt: {
            gte: cutoff,
          },
          state: {
            in: ["SCHEDULED", "LIVE", "DRAFT"],
          },
          transitions: {
            none: {
              trigger: "EVENT_META",
            },
          },
        },
      }),
      prisma.auction.findMany({
        where: {
          createdAt: {
            gte: cutoff,
          },
          state: {
            in: ["SCHEDULED", "LIVE", "DRAFT"],
          },
          transitions: {
            none: {
              trigger: "EVENT_META",
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          startingPrice: true,
          vehicle: {
            select: {
              brand: true,
              model: true,
              year: true,
              bodyType: true,
              fuelType: true,
            },
          },
        },
      }),
    ]);

    if (totalCount === 0 || newAuctions.length === 0) {
      schedulerLogger.info(
        {
          job: "runNewVehiclesDigest",
          processed: 0,
        },
        "Scheduler job completed",
      );
      return;
    }

    const activeUsers = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: "BUYER",
      },
      select: {
        email: true,
      },
    });

    const vehicles = await Promise.all(
      newAuctions.map(async (auction) => ({
        title: `${auction.vehicle.brand} ${auction.vehicle.model} ${auction.vehicle.year}`,
        startPriceAed: await toNumberValue(auction.startingPrice),
        meta: [auction.vehicle.year, auction.vehicle.bodyType, auction.vehicle.fuelType].filter(Boolean).join(" · "),
        auctionId: auction.id,
      })),
    );

    const digestBucket = new Date().toISOString().slice(0, 10);
    let processed = 0;

    for (const user of activeUsers) {
      const dedupKey = `digest:new-vehicles:${digestBucket}:${user.email}`;
      const shouldSend = await claimReminderKey(dedupKey, 5 * 24 * 3_600);

      if (!shouldSend) {
        continue;
      }

      void sendNewVehiclesDigestEmail(
        {
          email: user.email,
          name: user.email,
          vehicles,
          totalCount,
        },
        schedulerLogger,
      );
      processed += 1;
    }

    schedulerLogger.info(
      {
        job: "runNewVehiclesDigest",
        processed,
      },
      "Scheduler job completed",
    );
  } catch (error) {
    schedulerLogger.error(
      {
        job: "runNewVehiclesDigest",
        err: error instanceof Error ? error.message : String(error),
      },
      "Scheduler job failed",
    );
  }
}

export async function setSchedulerLogger(logger: LoggerLike): Promise<void> {
  schedulerLogger = logger;
}

export async function startScheduler(): Promise<void> {
  if (schedulerStarted) {
    return;
  }

  scheduledTasks.push(
    cron.schedule("* * * * *", async () => {
      try {
        await closeExpiredAuctions();
      } catch (error) {
        schedulerLogger.error(
          {
            job: "closeExpiredAuctions",
            err: error instanceof Error ? error.message : String(error),
          },
          "Scheduler job failed",
        );
      }
    }),
  );

  scheduledTasks.push(
    cron.schedule("*/5 * * * *", async () => {
      try {
        await runSellerDecisionDeadlineJob();
      } catch (error) {
        schedulerLogger.error(
          {
            job: "runSellerDecisionDeadlineJob",
            err: error instanceof Error ? error.message : String(error),
          },
          "Scheduler job failed",
        );
      }
    }),
  );

  scheduledTasks.push(
    cron.schedule("*/5 * * * *", async () => {
      try {
        await enforcePaymentDeadlines();
      } catch (error) {
        schedulerLogger.error(
          {
            job: "enforcePaymentDeadlines",
            err: error instanceof Error ? error.message : String(error),
          },
          "Scheduler job failed",
        );
      }
    }),
  );

  scheduledTasks.push(
    cron.schedule("*/15 * * * *", async () => {
      try {
        await runPaymentDeadlineReminders();
      } catch (error) {
        schedulerLogger.error(
          {
            job: "runPaymentDeadlineReminders",
            err: error instanceof Error ? error.message : String(error),
          },
          "Scheduler job failed",
        );
      }
    }),
  );

  scheduledTasks.push(
    cron.schedule("*/30 * * * *", async () => {
      try {
        await runWatchlistReminders();
      } catch (error) {
        schedulerLogger.error(
          {
            job: "runWatchlistReminders",
            err: error instanceof Error ? error.message : String(error),
          },
          "Scheduler job failed",
        );
      }
    }),
  );

  scheduledTasks.push(
    cron.schedule("0 * * * *", async () => {
      try {
        await runSellerAuctionReminders();
      } catch (error) {
        schedulerLogger.error(
          {
            job: "runSellerAuctionReminders",
            err: error instanceof Error ? error.message : String(error),
          },
          "Scheduler job failed",
        );
      }
    }),
  );

  scheduledTasks.push(
    cron.schedule(
      "0 9 */4 * *",
      async () => {
        try {
          await runNewVehiclesDigest();
        } catch (error) {
          schedulerLogger.error(
            {
              job: "runNewVehiclesDigest",
              err: error instanceof Error ? error.message : String(error),
            },
            "Scheduler job failed",
          );
        }
      },
      {
        timezone: schedulerTimezone,
      },
    ),
  );

  scheduledTasks.push(
    cron.schedule("*/30 * * * * *", async () => {
      try {
        await runEventAutoStartJob();
      } catch (error) {
        schedulerLogger.error(
          {
            job: "runEventAutoStartJob",
            err: error instanceof Error ? error.message : String(error),
          },
          "Scheduler job failed",
        );
      }
    }),
  );

  scheduledTasks.push(
    cron.schedule("*/2 * * * * *", async () => {
      try {
        await runEventTickJob();
      } catch (error) {
        schedulerLogger.error(
          {
            job: "runEventTickJob",
            err: error instanceof Error ? error.message : String(error),
          },
          "Scheduler job failed",
        );
      }
    }),
  );

  schedulerStarted = true;
  schedulerLogger.info({ job: "scheduler", started: true }, "Scheduler started");
}

export async function stopScheduler(): Promise<void> {
  for (const task of scheduledTasks) {
    task.stop();
    task.destroy();
  }

  scheduledTasks.length = 0;
  localReminderDedup.clear();
  await safeCloseReminderRedisClient();
  schedulerStarted = false;
}

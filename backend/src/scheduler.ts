import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";
import type { ScheduledTask } from "node-cron";
import cron from "node-cron";

import { prisma } from "./db";
import { releaseAuctionDepositLocks } from "./lib/auction-deposit-locks";
import { checkAndTick, startEvent } from "./lib/event-orchestrator";

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
  info: (object: Record<string, unknown>, message?: string) => void;
  error: (object: Record<string, unknown>, message?: string) => void;
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
};

const schedulerActorId = "system:scheduler";
const scheduledTasks: ScheduledTask[] = [];

let schedulerStarted = false;
let schedulerLogger: LoggerLike = {
  info(object: Record<string, unknown>, message?: string): void {
    if (message) {
      console.info(message, object);
      return;
    }

    console.info(object);
  },
  error(object: Record<string, unknown>, message?: string): void {
    if (message) {
      console.error(message, object);
      return;
    }

    console.error(object);
  },
};

async function addHours(base: Date, hours: number): Promise<Date> {
  const next = new Date(base);

  next.setUTCHours(next.getUTCHours() + hours);

  return next;
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
        const winner = await tx.bid.findFirst({
          where: {
            auctionId: auction.id,
          },
          orderBy: [{ amount: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            companyId: true,
            amount: true,
          },
        });

        const nextState = winner ? "AWAITING_SELLER_DECISION" : "ENDED";
        const decisionDeadlineAt = winner ? await addHours(new Date(), 24) : null;
        const updateResult = await tx.$executeRaw`
          UPDATE auctions
          SET state = ${nextState}::"AuctionState",
              winner_company_id = ${winner?.companyId ?? null},
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
              winnerCompanyId: winner?.companyId ?? null,
            }),
          },
        });

        if (winner) {
          await releaseAuctionDepositLocks(tx, {
            auctionId: auction.id,
            winnerCompanyId: winner.companyId,
            reason: "AUCTION_LOST_RELEASE",
          });
        } else {
          await releaseAuctionDepositLocks(tx, {
            auctionId: auction.id,
            reason: "AUCTION_ENDED_NO_WINNER",
          });
        }

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
        SELECT id, seller_company_id, winner_company_id
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
  schedulerStarted = false;
}

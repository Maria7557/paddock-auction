import { createHash } from "node:crypto";

import type { ScheduledTask } from "node-cron";
import cron from "node-cron";

import { prisma } from "./db";

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
          payload: any;
        };
      }) => Promise<unknown>;
    };
  },
  input: {
    action: string;
    entityType: string;
    entityId: string;
    payload: any;
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
      payload: JSON.parse(JSON.stringify(input.payload)) as any,
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

        const nextState = winner ? "PAYMENT_PENDING" : "ENDED";
        const updateResult = await tx.$executeRaw`
          UPDATE auctions
          SET state = ${nextState}::"AuctionState",
              winner_company_id = ${winner?.companyId ?? null},
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
          const dueAt = await addHours(new Date(), 48);
          const subtotal = await toNumberValue(winner.amount);
          const existingInvoice = await tx.invoice.findUnique({
            where: {
              auctionId: auction.id,
            },
            select: {
              id: true,
            },
          });

          if (!existingInvoice) {
            await tx.invoice.create({
              data: {
                auctionId: auction.id,
                buyerCompanyId: winner.companyId,
                sellerCompanyId: auction.seller_company_id,
                subtotal,
                commission: 0,
                vat: 0,
                total: subtotal,
                currency: "AED",
                dueAt,
              },
            });
          }

          const existingDeadline = await tx.paymentDeadline.findFirst({
            where: {
              auctionId: auction.id,
              buyerCompanyId: winner.companyId,
              status: "ACTIVE",
            },
            select: {
              id: true,
            },
          });

          if (!existingDeadline) {
            await tx.paymentDeadline.create({
              data: {
                auctionId: auction.id,
                buyerCompanyId: winner.companyId,
                dueAt,
              },
            });
          }
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

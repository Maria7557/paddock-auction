import { randomUUID } from "node:crypto";

import cron from "node-cron";

import type { SqlClient, SqlRow, SqlTransactionRunner } from "../../lib/sql_contract";
import { toNumber } from "../../lib/sql_contract";
import { assertAuctionTransitionAllowed } from "./domain/auction_state_machine";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const DEFAULT_START_CRON_EXPRESSION = "* * * * *";
const DEFAULT_CLOSE_CRON_EXPRESSION = "* * * * *";

type DueAuctionState = "SCHEDULED" | "LIVE";
type DueAuctionTransitionState = "LIVE" | "ENDED";
type SchedulerJobName = "start_due_auctions" | "close_due_auctions";

type DueAuctionRow = SqlRow & {
  id: unknown;
  version: unknown;
};

type ScheduledCronTask = {
  start(): void;
  stop(): void;
  destroy?(): void;
};

export type AuctionSchedulerCommand = {
  occurredAt: Date;
  batchSize?: number;
};

export type AuctionSchedulerItem = {
  auctionId: string;
  fromState: DueAuctionState;
  toState: DueAuctionTransitionState;
  version: number;
  transitionId: string;
};

export type AuctionSchedulerResult = {
  processedCount: number;
  items: AuctionSchedulerItem[];
};

export type AuctionLifecycleScheduler = {
  startDueAuctions(command: AuctionSchedulerCommand): Promise<AuctionSchedulerResult>;
  closeDueAuctions(command: AuctionSchedulerCommand): Promise<AuctionSchedulerResult>;
};

export type AuctionLifecycleCronScheduler = {
  start(): void;
  stop(): void;
  runStartDueAuctions(): Promise<AuctionSchedulerResult>;
  runCloseDueAuctions(): Promise<AuctionSchedulerResult>;
};

export type CreateAuctionLifecycleCronSchedulerInput = {
  scheduler: Pick<AuctionLifecycleScheduler, "startDueAuctions" | "closeDueAuctions">;
  now?: () => Date;
  batchSize?: number;
  startCronExpression?: string;
  closeCronExpression?: string;
  scheduleTask?: (
    cronExpression: string,
    handler: () => void | Promise<void>,
  ) => ScheduledCronTask;
  onError?: (jobName: SchedulerJobName, error: unknown) => void;
};

type DueTransitionConfig = {
  fromState: DueAuctionState;
  toState: DueAuctionTransitionState;
  dueColumn: "starts_at" | "ends_at";
  trigger: string;
  reason: string;
  setClosedAt: boolean;
};

function resolveBatchSize(batchSize: number | undefined): number {
  if (batchSize === undefined) {
    return DEFAULT_BATCH_SIZE;
  }

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(batchSize, MAX_BATCH_SIZE);
}

function createDueAuctionSelectSql(dueColumn: "starts_at" | "ends_at"): string {
  return `SELECT id, version
          FROM auctions
          WHERE state = $1
            AND ${dueColumn} <= $2::timestamptz
          ORDER BY ${dueColumn} ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1`;
}

async function processNextDueAuction(
  tx: SqlClient,
  command: AuctionSchedulerCommand,
  config: DueTransitionConfig,
): Promise<AuctionSchedulerItem | null> {
  const dueAuctionResult = await tx.query<DueAuctionRow>(createDueAuctionSelectSql(config.dueColumn), [
    config.fromState,
    command.occurredAt.toISOString(),
  ]);

  if (dueAuctionResult.rows.length === 0) {
    return null;
  }

  const dueAuction = dueAuctionResult.rows[0];
  const auctionId = String(dueAuction.id);
  const currentVersion = toNumber(dueAuction.version, "auctions.version");
  const nextVersion = currentVersion + 1;

  assertAuctionTransitionAllowed(config.fromState, config.toState);

  if (config.setClosedAt) {
    await tx.query(
      `UPDATE auctions
       SET state = $2,
           version = $3,
           closed_at = COALESCE(closed_at, $4::timestamptz),
           updated_at = $4::timestamptz
       WHERE id = $1`,
      [auctionId, config.toState, nextVersion, command.occurredAt.toISOString()],
    );
  } else {
    await tx.query(
      `UPDATE auctions
       SET state = $2,
           version = $3,
           updated_at = $4::timestamptz
       WHERE id = $1`,
      [auctionId, config.toState, nextVersion, command.occurredAt.toISOString()],
    );
  }

  const transitionId = randomUUID();

  await tx.query(
    `INSERT INTO auction_state_transitions (
       id,
       auction_id,
       from_state,
       to_state,
       trigger,
       reason,
       actor_id,
       created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7::timestamptz)`,
    [
      transitionId,
      auctionId,
      config.fromState,
      config.toState,
      config.trigger,
      config.reason,
      command.occurredAt.toISOString(),
    ],
  );

  return {
    auctionId,
    fromState: config.fromState,
    toState: config.toState,
    version: nextVersion,
    transitionId,
  };
}

async function processDueTransitions(
  transactionRunner: SqlTransactionRunner,
  command: AuctionSchedulerCommand,
  config: DueTransitionConfig,
): Promise<AuctionSchedulerResult> {
  const batchSize = resolveBatchSize(command.batchSize);
  const items: AuctionSchedulerItem[] = [];

  for (let index = 0; index < batchSize; index += 1) {
    const item = await transactionRunner.transaction((tx) => processNextDueAuction(tx, command, config));

    if (item === null) {
      break;
    }

    items.push(item);
  }

  return {
    processedCount: items.length,
    items,
  };
}

export async function startDueAuctions(
  transactionRunner: SqlTransactionRunner,
  command: AuctionSchedulerCommand,
): Promise<AuctionSchedulerResult> {
  return processDueTransitions(transactionRunner, command, {
    fromState: "SCHEDULED",
    toState: "LIVE",
    dueColumn: "starts_at",
    trigger: "auction_lifecycle_scheduler",
    reason: "Auction start time reached",
    setClosedAt: false,
  });
}

export async function closeDueAuctions(
  transactionRunner: SqlTransactionRunner,
  command: AuctionSchedulerCommand,
): Promise<AuctionSchedulerResult> {
  return processDueTransitions(transactionRunner, command, {
    fromState: "LIVE",
    toState: "ENDED",
    dueColumn: "ends_at",
    trigger: "auction_lifecycle_scheduler",
    reason: "Auction end time reached",
    setClosedAt: true,
  });
}

export function createAuctionLifecycleScheduler(
  transactionRunner: SqlTransactionRunner,
): AuctionLifecycleScheduler {
  return {
    startDueAuctions: async (command) => startDueAuctions(transactionRunner, command),
    closeDueAuctions: async (command) => closeDueAuctions(transactionRunner, command),
  };
}

function defaultScheduleTask(
  cronExpression: string,
  handler: () => void | Promise<void>,
): ScheduledCronTask {
  const task = cron.schedule(cronExpression, () => {
    void Promise.resolve(handler());
  }, { scheduled: false });

  return {
    start: () => task.start(),
    stop: () => task.stop(),
    destroy: () => task.destroy(),
  };
}

export function createAuctionLifecycleCronScheduler(
  input: CreateAuctionLifecycleCronSchedulerInput,
): AuctionLifecycleCronScheduler {
  const now = input.now ?? (() => new Date());
  const batchSize = resolveBatchSize(input.batchSize);
  const scheduleTask = input.scheduleTask ?? defaultScheduleTask;

  const runStartDueAuctions = async (): Promise<AuctionSchedulerResult> => {
    return input.scheduler.startDueAuctions({
      occurredAt: now(),
      batchSize,
    });
  };

  const runCloseDueAuctions = async (): Promise<AuctionSchedulerResult> => {
    return input.scheduler.closeDueAuctions({
      occurredAt: now(),
      batchSize,
    });
  };

  const onError = input.onError ?? ((jobName: SchedulerJobName, error: unknown) => {
    console.error("Auction lifecycle scheduler job failed", { jobName, error });
  });

  const startTask = scheduleTask(
    input.startCronExpression ?? DEFAULT_START_CRON_EXPRESSION,
    async () => {
      try {
        await runStartDueAuctions();
      } catch (error) {
        onError("start_due_auctions", error);
      }
    },
  );

  const closeTask = scheduleTask(
    input.closeCronExpression ?? DEFAULT_CLOSE_CRON_EXPRESSION,
    async () => {
      try {
        await runCloseDueAuctions();
      } catch (error) {
        onError("close_due_auctions", error);
      }
    },
  );

  return {
    start(): void {
      startTask.start();
      closeTask.start();
    },

    stop(): void {
      startTask.stop();
      closeTask.stop();
      startTask.destroy?.();
      closeTask.destroy?.();
    },

    runStartDueAuctions,
    runCloseDueAuctions,
  };
}

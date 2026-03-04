import {
  incrementGuardrailCounter,
} from "../../platform/domain/metrics";
import {
  createPaymentDeadlineEnforcementRepository,
  type DeadlineProcessingResult,
  type PaymentDeadlineEnforcementRepository,
} from "../infrastructure/payment_deadline_enforcement_sql_repository";
import type { SqlTransactionRunner } from "../../../lib/sql_contract";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

export type EnforcePaymentDeadlinesCommand = {
  occurredAt: Date;
  batchSize?: number;
};

export type EnforcePaymentDeadlineItemResult = DeadlineProcessingResult & {
  durationMs: number;
};

export type EnforcePaymentDeadlinesResult = {
  processedCount: number;
  defaultedCount: number;
  paidCount: number;
  noopCount: number;
  items: EnforcePaymentDeadlineItemResult[];
};

export type PaymentDeadlineEnforcementService = {
  enforceDuePaymentDeadlines(
    command: EnforcePaymentDeadlinesCommand,
  ): Promise<EnforcePaymentDeadlinesResult>;
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

async function enforceDuePaymentDeadlines(
  repository: PaymentDeadlineEnforcementRepository,
  command: EnforcePaymentDeadlinesCommand,
): Promise<EnforcePaymentDeadlinesResult> {
  const batchSize = resolveBatchSize(command.batchSize);
  const items: EnforcePaymentDeadlineItemResult[] = [];

  for (let index = 0; index < batchSize; index += 1) {
    const startedAt = Date.now();
    const nextDeadlineResult = await repository.processNextDueDeadline({
      occurredAt: command.occurredAt,
    });

    if (nextDeadlineResult === null) {
      break;
    }

    const item: EnforcePaymentDeadlineItemResult = {
      ...nextDeadlineResult,
      durationMs: Date.now() - startedAt,
    };

    if (item.defaulted) {
      incrementGuardrailCounter("payment_deadline_default_total");
    }

    items.push(item);
  }

  return {
    processedCount: items.length,
    defaultedCount: items.filter((item) => item.result === "defaulted").length,
    paidCount: items.filter((item) => item.result === "paid").length,
    noopCount: items.filter((item) => item.result === "noop").length,
    items,
  };
}

export function createPaymentDeadlineEnforcementService(
  transactionRunner: SqlTransactionRunner,
): PaymentDeadlineEnforcementService {
  const repository = createPaymentDeadlineEnforcementRepository(transactionRunner);

  return {
    enforceDuePaymentDeadlines: async (command) => {
      return enforceDuePaymentDeadlines(repository, command);
    },
  };
}

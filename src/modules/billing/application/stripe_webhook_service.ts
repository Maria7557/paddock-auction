import {
  createStripeWebhookRepository,
  type StripeWebhookProcessInput,
  type StripeWebhookProcessResult,
} from "../infrastructure/stripe_webhook_sql_repository";
import type { SqlTransactionRunner } from "../../../lib/sql_contract";

export type StripeWebhookService = {
  processStripeWebhook(input: StripeWebhookProcessInput): Promise<StripeWebhookProcessResult>;
};

export function createStripeWebhookService(
  transactionRunner: SqlTransactionRunner,
): StripeWebhookService {
  const repository = createStripeWebhookRepository(transactionRunner);

  return {
    processStripeWebhook: async (input) => repository.processStripeWebhook(input),
  };
}

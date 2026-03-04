import type {
  CreateStripePaymentIntentFn,
  StripePaymentIntentResponse,
} from "../infrastructure/stripe_payment_intent_gateway";
import {
  createPaymentIntentRepository,
  type PaymentIntentRepository,
} from "../infrastructure/payment_intent_sql_repository";
import type { SqlTransactionRunner } from "../../../lib/sql_contract";

export type CreateInvoicePaymentIntentCommand = {
  invoiceId: string;
  idempotencyKey: string;
  occurredAt: Date;
};

export type CreateInvoicePaymentIntentResult = {
  invoiceId: string;
  paymentId: string;
  stripePaymentIntentId: string;
  clientSecret: string | null;
  amount: number;
  currency: string;
  replayed: boolean;
};

export type PaymentIntentService = {
  createInvoicePaymentIntent(
    command: CreateInvoicePaymentIntentCommand,
  ): Promise<CreateInvoicePaymentIntentResult>;
};

async function createOrReplayPaymentIntent(
  repository: PaymentIntentRepository,
  createStripePaymentIntentFn: CreateStripePaymentIntentFn,
  command: CreateInvoicePaymentIntentCommand,
): Promise<CreateInvoicePaymentIntentResult> {
  const prepared = await repository.preparePaymentIntent({
    invoiceId: command.invoiceId,
    idempotencyKey: command.idempotencyKey,
    occurredAt: command.occurredAt,
  });

  if (prepared.kind === "replay") {
    return {
      invoiceId: prepared.invoiceId,
      paymentId: prepared.paymentId,
      stripePaymentIntentId: prepared.stripePaymentIntentId,
      clientSecret: null,
      amount: prepared.amount,
      currency: prepared.currency,
      replayed: true,
    };
  }

  const stripePaymentIntent = await createStripePaymentIntentFn({
    amount: prepared.amount,
    currency: prepared.currency,
    invoiceId: prepared.invoiceId,
    idempotencyKey: command.idempotencyKey,
  });

  const persisted = await repository.attachStripePaymentIntent({
    paymentId: prepared.paymentId,
    stripePaymentIntentId: stripePaymentIntent.stripePaymentIntentId,
    occurredAt: command.occurredAt,
  });

  return {
    invoiceId: persisted.invoiceId,
    paymentId: persisted.paymentId,
    stripePaymentIntentId: persisted.stripePaymentIntentId,
    clientSecret: resolveClientSecret(stripePaymentIntent, persisted.stripePaymentIntentId),
    amount: persisted.amount,
    currency: persisted.currency,
    replayed: false,
  };
}

function resolveClientSecret(
  stripePaymentIntent: StripePaymentIntentResponse,
  persistedStripePaymentIntentId: string,
): string | null {
  if (stripePaymentIntent.stripePaymentIntentId === persistedStripePaymentIntentId) {
    return stripePaymentIntent.clientSecret;
  }

  return null;
}

export function createPaymentIntentService(
  transactionRunner: SqlTransactionRunner,
  createStripePaymentIntentFn: CreateStripePaymentIntentFn,
): PaymentIntentService {
  const repository = createPaymentIntentRepository(transactionRunner);

  return {
    createInvoicePaymentIntent: async (command) => {
      return createOrReplayPaymentIntent(repository, createStripePaymentIntentFn, command);
    },
  };
}

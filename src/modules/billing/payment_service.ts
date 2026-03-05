import type {
  CreateStripePaymentIntentFn,
  StripePaymentIntentResponse,
} from "./infrastructure/stripe_payment_intent_gateway";
import {
  createPaymentIntentRepository,
  type PaymentIntentRepository,
} from "./infrastructure/payment_intent_sql_repository";
import type { SqlTransactionRunner } from "../../lib/sql_contract";

export type CreatePaymentIntentCommand = {
  invoiceId: string;
  idempotencyKey: string;
  occurredAt: Date;
};

export type CreatePaymentIntentResult = {
  invoiceId: string;
  paymentId: string;
  stripePaymentIntentId: string;
  clientSecret: string | null;
  amount: number;
  currency: string;
  replayed: boolean;
};

export type PaymentService = {
  createPaymentIntent(command: CreatePaymentIntentCommand): Promise<CreatePaymentIntentResult>;
};

export async function createPaymentIntent(
  repository: Pick<PaymentIntentRepository, "preparePaymentIntent" | "attachStripePaymentIntent">,
  createStripePaymentIntentFn: CreateStripePaymentIntentFn,
  command: CreatePaymentIntentCommand,
): Promise<CreatePaymentIntentResult> {
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

export function createPaymentService(
  transactionRunner: SqlTransactionRunner,
  createStripePaymentIntentFn: CreateStripePaymentIntentFn,
): PaymentService {
  const repository = createPaymentIntentRepository(transactionRunner);

  return {
    createPaymentIntent: async (command) =>
      createPaymentIntent(repository, createStripePaymentIntentFn, command),
  };
}

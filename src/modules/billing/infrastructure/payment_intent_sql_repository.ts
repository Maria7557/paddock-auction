import { randomUUID } from "node:crypto";

import { DomainConflictError, DomainNotFoundError } from "../../../lib/domain_errors";
import type { SqlRow, SqlTransactionRunner } from "../../../lib/sql_contract";
import { toNumber } from "../../../lib/sql_contract";
import { billingErrorCodes } from "../domain/billing_error_codes";

export type PreparePaymentIntentInput = {
  invoiceId: string;
  idempotencyKey: string;
  occurredAt: Date;
};

export type PreparePaymentIntentResult =
  | {
      kind: "replay";
      invoiceId: string;
      paymentId: string;
      stripePaymentIntentId: string;
      amount: number;
      currency: string;
    }
  | {
      kind: "create";
      invoiceId: string;
      paymentId: string;
      amount: number;
      currency: string;
    };

export type AttachPaymentIntentInput = {
  paymentId: string;
  stripePaymentIntentId: string;
  occurredAt: Date;
};

export type AttachPaymentIntentResult = {
  invoiceId: string;
  paymentId: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
};

export type PaymentIntentRepository = {
  preparePaymentIntent(input: PreparePaymentIntentInput): Promise<PreparePaymentIntentResult>;
  attachStripePaymentIntent(input: AttachPaymentIntentInput): Promise<AttachPaymentIntentResult>;
};

type InvoiceRow = SqlRow & {
  id: unknown;
  status: unknown;
  total: unknown;
  currency: unknown;
};

type PaymentRow = SqlRow & {
  id: unknown;
  invoice_id: unknown;
  status: unknown;
  stripe_payment_intent_id: unknown;
  amount: unknown;
  currency: unknown;
};

function mapPaymentRow(row: PaymentRow): AttachPaymentIntentResult {
  const stripePaymentIntentId =
    row.stripe_payment_intent_id === null || row.stripe_payment_intent_id === undefined
      ? null
      : String(row.stripe_payment_intent_id);

  if (stripePaymentIntentId === null) {
    throw new Error("Payment row is missing stripe_payment_intent_id");
  }

  return {
    invoiceId: String(row.invoice_id),
    paymentId: String(row.id),
    stripePaymentIntentId,
    amount: toNumber(row.amount, "amount"),
    currency: String(row.currency),
  };
}

export function createPaymentIntentRepository(
  transactionRunner: SqlTransactionRunner,
): PaymentIntentRepository {
  return {
    async preparePaymentIntent(input: PreparePaymentIntentInput): Promise<PreparePaymentIntentResult> {
      return transactionRunner.transaction(async (tx) => {
        const invoiceResult = await tx.query<InvoiceRow>(
          `SELECT id, status, total, currency
           FROM invoices
           WHERE id = $1
           FOR UPDATE`,
          [input.invoiceId],
        );

        if (invoiceResult.rows.length === 0) {
          throw new DomainNotFoundError(
            billingErrorCodes.invoiceNotFound,
            `Invoice ${input.invoiceId} was not found`,
          );
        }

        const invoice = invoiceResult.rows[0];

        const invoiceStatus = String(invoice.status);

        if (invoiceStatus !== "ISSUED" && invoiceStatus !== "PENDING") {
          throw new DomainConflictError(
            billingErrorCodes.invoiceNotIssued,
            `Invoice ${input.invoiceId} is not in PENDING status`,
          );
        }

        const existingPaymentResult = await tx.query<PaymentRow>(
          `SELECT
             id,
             invoice_id,
             status,
             stripe_payment_intent_id,
             amount,
             currency
           FROM payments
           WHERE invoice_id = $1
             AND idempotency_key = $2
           FOR UPDATE`,
          [input.invoiceId, input.idempotencyKey],
        );

        if (existingPaymentResult.rows.length > 0) {
          const existingPayment = existingPaymentResult.rows[0];
          const stripePaymentIntentId =
            existingPayment.stripe_payment_intent_id === null ||
            existingPayment.stripe_payment_intent_id === undefined
              ? null
              : String(existingPayment.stripe_payment_intent_id);

          if (stripePaymentIntentId !== null) {
            return {
              kind: "replay",
              invoiceId: String(existingPayment.invoice_id),
              paymentId: String(existingPayment.id),
              stripePaymentIntentId,
              amount: toNumber(existingPayment.amount, "amount"),
              currency: String(existingPayment.currency),
            };
          }

          return {
            kind: "create",
            invoiceId: String(existingPayment.invoice_id),
            paymentId: String(existingPayment.id),
            amount: toNumber(existingPayment.amount, "amount"),
            currency: String(existingPayment.currency),
          };
        }

        const paymentInsertResult = await tx.query<PaymentRow>(
          `INSERT INTO payments (
             id,
             invoice_id,
             status,
             idempotency_key,
             amount,
             currency,
             created_at,
             updated_at
           ) VALUES ($1, $2, 'PENDING', $3, $4, $5, $6::timestamptz, $6::timestamptz)
           RETURNING
             id,
             invoice_id,
             status,
             stripe_payment_intent_id,
             amount,
             currency`,
          [
            randomUUID(),
            input.invoiceId,
            input.idempotencyKey,
            toNumber(invoice.total, "total"),
            String(invoice.currency),
            input.occurredAt.toISOString(),
          ],
        );

        const payment = paymentInsertResult.rows[0];

        return {
          kind: "create",
          invoiceId: String(payment.invoice_id),
          paymentId: String(payment.id),
          amount: toNumber(payment.amount, "amount"),
          currency: String(payment.currency),
        };
      });
    },

    async attachStripePaymentIntent(input: AttachPaymentIntentInput): Promise<AttachPaymentIntentResult> {
      return transactionRunner.transaction(async (tx) => {
        const paymentResult = await tx.query<PaymentRow>(
          `SELECT
             id,
             invoice_id,
             status,
             stripe_payment_intent_id,
             amount,
             currency
           FROM payments
           WHERE id = $1
           FOR UPDATE`,
          [input.paymentId],
        );

        if (paymentResult.rows.length === 0) {
          throw new DomainNotFoundError(
            billingErrorCodes.invoiceNotFound,
            `Payment ${input.paymentId} was not found`,
          );
        }

        const existingPayment = paymentResult.rows[0];
        const existingIntentId =
          existingPayment.stripe_payment_intent_id === null ||
          existingPayment.stripe_payment_intent_id === undefined
            ? null
            : String(existingPayment.stripe_payment_intent_id);

        if (existingIntentId !== null) {
          return mapPaymentRow(existingPayment);
        }

        const updateResult = await tx.query<PaymentRow>(
          `UPDATE payments
           SET stripe_payment_intent_id = $2,
               last_event_at = $3::timestamptz,
               updated_at = $3::timestamptz
           WHERE id = $1
           RETURNING
             id,
             invoice_id,
             status,
             stripe_payment_intent_id,
             amount,
             currency`,
          [input.paymentId, input.stripePaymentIntentId, input.occurredAt.toISOString()],
        );

        return mapPaymentRow(updateResult.rows[0]);
      });
    },
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import { createInvoiceForWinner, createInvoiceService } from "./invoice_service";
import type { InvoiceRepository, WinnerInvoice } from "./invoice_repository";
import type { SqlClient, SqlTransactionRunner } from "../../lib/sql_contract";

function buildWinnerInvoice(overrides: Partial<WinnerInvoice> = {}): WinnerInvoice {
  return {
    id: "invoice-1",
    auctionId: "auction-1",
    buyerId: "buyer-1",
    amount: 1000,
    status: "PENDING",
    createdAt: new Date("2026-03-05T10:00:00.000Z"),
    paymentDeadline: new Date("2026-03-07T10:00:00.000Z"),
    ...overrides,
  };
}

test("createInvoiceForWinner delegates to repository", async () => {
  let capturedAuctionId: string | null = null;

  const repository: Pick<InvoiceRepository, "createInvoiceForWinner"> = {
    createInvoiceForWinner: async (auctionId: string) => {
      capturedAuctionId = auctionId;
      return buildWinnerInvoice({ auctionId });
    },
  };

  const result = await createInvoiceForWinner(repository, "auction-test-1");

  assert.equal(capturedAuctionId, "auction-test-1");
  assert.equal(result.auctionId, "auction-test-1");
  assert.equal(result.status, "PENDING");
});

test("createInvoiceService creates repository-backed service", async () => {
  const transactionRunner: SqlTransactionRunner = {
    async transaction<T>(handler: (tx: SqlClient) => Promise<T>): Promise<T> {
      const tx: SqlClient = {
        async query(): Promise<{ rows: [] }> {
          return { rows: [] };
        },
      };
      return handler(tx);
    },
  };

  const service = createInvoiceService(transactionRunner);

  await assert.rejects(
    async () => {
      await service.createInvoiceForWinner("auction-missing");
    },
    /INVOICE_AUCTION_NOT_FOUND|was not found/i,
  );
});

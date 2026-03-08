import assert from "node:assert/strict";
import test from "node:test";

import { createInvoiceService } from "../../src/modules/billing/invoice_service";
import { createPgliteTransactionRunner } from "./helpers/pglite_sql_runner";
import { createMigratedTestDb } from "./helpers/migration_harness";

async function withMigratedDb(
  assertion: (context: Awaited<ReturnType<typeof createMigratedTestDb>>) => Promise<void>,
): Promise<void> {
  const migratedDb = await createMigratedTestDb();

  try {
    await assertion(migratedDb);
  } finally {
    await migratedDb.cleanup();
  }
}

test("auction winner creates invoice", async () => {
  await withMigratedDb(async ({ db }) => {
    await db.query(
      `INSERT INTO auctions (
         id,
         vehicle_id,
         seller_company_id,
         state,
         version,
         current_price,
         min_increment,
         last_bid_sequence,
         starts_at,
         ends_at,
         closed_at
       ) VALUES ($1, $2, $3, 'ENDED', 1, $4, 1, 1, $5::timestamptz, $6::timestamptz, $7::timestamptz)`,
      [
        "auction-invoice-service-1",
        "vehicle-invoice-service-1",
        "seller-invoice-service-1",
        1250,
        "2026-03-01T00:00:00Z",
        "2026-03-02T00:00:00Z",
        "2026-03-02T00:00:00Z",
      ],
    );

    await db.query(
      `INSERT INTO bids (
         id,
         auction_id,
         company_id,
         user_id,
         amount,
         sequence_no,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, 1, $6::timestamptz)`,
      [
        "bid-invoice-service-1",
        "auction-invoice-service-1",
        "buyer-company-invoice-1",
        "buyer-user-invoice-1",
        1250,
        "2026-03-01T20:00:00Z",
      ],
    );

    await db.query(
      `UPDATE auctions
       SET highest_bid_id = $2,
           winner_company_id = $3
       WHERE id = $1`,
      ["auction-invoice-service-1", "bid-invoice-service-1", "buyer-company-invoice-1"],
    );

    const service = createInvoiceService(createPgliteTransactionRunner(db));
    const createdInvoice = await service.createInvoiceForWinner("auction-invoice-service-1");

    assert.equal(createdInvoice.auctionId, "auction-invoice-service-1");
    assert.equal(createdInvoice.buyerId, "buyer-company-invoice-1");
    assert.equal(createdInvoice.amount, 1250);
    assert.equal(createdInvoice.status, "PENDING");
    assert.equal(createdInvoice.paymentDeadline.toISOString(), "2026-03-04T00:00:00.000Z");

    const invoiceRows = await db.query<{
      buyer_company_id: string;
      total: string;
      status: string;
      due_at: string;
    }>(
      `SELECT buyer_company_id, total, status, due_at
       FROM invoices
       WHERE auction_id = $1`,
      ["auction-invoice-service-1"],
    );

    assert.equal(invoiceRows.rows.length, 1);
    assert.equal(invoiceRows.rows[0].buyer_company_id, "buyer-company-invoice-1");
    assert.equal(Number(invoiceRows.rows[0].total), 1250);
    assert.equal(invoiceRows.rows[0].status, "ISSUED");
    assert.equal(new Date(invoiceRows.rows[0].due_at).toISOString(), "2026-03-04T00:00:00.000Z");
  });
});

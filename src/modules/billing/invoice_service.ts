import { createInvoiceRepository, type InvoiceRepository, type WinnerInvoice } from "./invoice_repository";
import type { SqlTransactionRunner } from "../../lib/sql_contract";

export type InvoiceService = {
  createInvoiceForWinner(auctionId: string): Promise<WinnerInvoice>;
};

export async function createInvoiceForWinner(
  repository: Pick<InvoiceRepository, "createInvoiceForWinner">,
  auctionId: string,
): Promise<WinnerInvoice> {
  return repository.createInvoiceForWinner(auctionId);
}

export function createInvoiceService(
  transactionRunner: SqlTransactionRunner,
): InvoiceService {
  const repository = createInvoiceRepository(transactionRunner);

  return {
    createInvoiceForWinner: async (auctionId) => createInvoiceForWinner(repository, auctionId),
  };
}

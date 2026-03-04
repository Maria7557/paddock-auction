import {
  createWinnerFinalizationRepository,
  type FinalizeAuctionWinnerInput,
  type FinalizeAuctionWinnerResult,
} from "../infrastructure/winner_finalization_sql_repository";
import type { SqlTransactionRunner } from "../../../lib/sql_contract";

export type WinnerFinalizationService = {
  finalizeAuctionWinner(input: FinalizeAuctionWinnerInput): Promise<FinalizeAuctionWinnerResult>;
};

export function createWinnerFinalizationService(
  transactionRunner: SqlTransactionRunner,
): WinnerFinalizationService {
  const repository = createWinnerFinalizationRepository(transactionRunner);

  return {
    finalizeAuctionWinner: async (input) => repository.finalizeAuctionWinner(input),
  };
}

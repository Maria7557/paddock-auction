import { randomUUID } from "node:crypto";

import { DomainNotFoundError } from "../../../lib/domain_errors";
import type { SqlClient, SqlRow, SqlTransactionRunner } from "../../../lib/sql_contract";
import { toNumber } from "../../../lib/sql_contract";

export const AUCTION_NOT_FOUND_CODE = "AUCTION_NOT_FOUND";

export type AuctionTransitionRow = {
  id: string;
  state: string;
  version: number;
  closedAt: Date | null;
};

export type PersistedAuctionTransition = {
  transitionId: string;
  fromState: string;
  toState: string;
  trigger: string;
  reason?: string;
  actorId?: string;
  occurredAt: Date;
};

type AuctionRow = SqlRow & {
  id: unknown;
  state: unknown;
  version: unknown;
  closed_at: unknown;
};

type TransitionInsertRow = SqlRow & {
  id: unknown;
};

function mapAuctionRow(row: AuctionRow): AuctionTransitionRow {
  const closedAtRaw = row.closed_at;

  return {
    id: String(row.id),
    state: String(row.state),
    version: toNumber(row.version, "version"),
    closedAt:
      closedAtRaw === null || closedAtRaw === undefined ? null : new Date(String(closedAtRaw)),
  };
}

export type AuctionTransitionTransaction = {
  getAuctionForUpdate(auctionId: string): Promise<AuctionTransitionRow>;
  persistTransitionAndState(
    auctionId: string,
    nextState: string,
    nextVersion: number,
    transition: PersistedAuctionTransition,
  ): Promise<void>;
};

export type AuctionTransitionRepository = {
  transaction<T>(handler: (tx: AuctionTransitionTransaction) => Promise<T>): Promise<T>;
};

function createAuctionTransitionTransaction(tx: SqlClient): AuctionTransitionTransaction {
  return {
    async getAuctionForUpdate(auctionId: string): Promise<AuctionTransitionRow> {
      const result = await tx.query<AuctionRow>(
        `SELECT id, state, version, closed_at
         FROM auctions
         WHERE id = $1
         FOR UPDATE`,
        [auctionId],
      );

      if (result.rows.length === 0) {
        throw new DomainNotFoundError(AUCTION_NOT_FOUND_CODE, `Auction ${auctionId} was not found`);
      }

      return mapAuctionRow(result.rows[0]);
    },

    async persistTransitionAndState(
      auctionId: string,
      nextState: string,
      nextVersion: number,
      transition: PersistedAuctionTransition,
    ): Promise<void> {
      await tx.query(
        `UPDATE auctions
         SET state = $2,
             version = $3,
             closed_at = $4,
             updated_at = $5
         WHERE id = $1`,
        [
          auctionId,
          nextState,
          nextVersion,
          transition.toState === "ENDED" ? transition.occurredAt.toISOString() : null,
          transition.occurredAt.toISOString(),
        ],
      );

      const insertResult = await tx.query<TransitionInsertRow>(
        `INSERT INTO auction_state_transitions (
           id,
           auction_id,
           from_state,
           to_state,
           trigger,
           reason,
           actor_id,
           created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          transition.transitionId,
          auctionId,
          transition.fromState,
          transition.toState,
          transition.trigger,
          transition.reason ?? null,
          transition.actorId ?? null,
          transition.occurredAt.toISOString(),
        ],
      );

      if (insertResult.rows.length !== 1) {
        throw new Error("Expected exactly one auction transition insert");
      }
    },
  };
}

export function createAuctionTransitionRepository(
  transactionRunner: SqlTransactionRunner,
): AuctionTransitionRepository {
  return {
    async transaction<T>(handler: (tx: AuctionTransitionTransaction) => Promise<T>): Promise<T> {
      return transactionRunner.transaction(async (sqlTx) => {
        const repositoryTx = createAuctionTransitionTransaction(sqlTx);
        return handler(repositoryTx);
      });
    },
  };
}

export function newAuctionTransitionId(): string {
  return randomUUID();
}

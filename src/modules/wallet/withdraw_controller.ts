import { z } from "zod";

import { DomainError } from "../../lib/domain_errors";
import { prismaSqlTransactionRunner } from "../../infrastructure/database/prisma_sql_runner";
import { createWithdrawService, type WithdrawService } from "./withdraw_service";

export const WALLET_USER_ID_REQUIRED_CODE = "WALLET_USER_ID_REQUIRED";
export const WALLET_INVALID_WITHDRAW_REQUEST_CODE = "WALLET_INVALID_WITHDRAW_REQUEST";
export const WALLET_INTERNAL_ERROR_CODE = "WALLET_INTERNAL_ERROR";

const withdrawRequestSchema = z.object({
  amount: z.coerce.number().int().positive(),
});

type WithdrawRequestPayload = z.infer<typeof withdrawRequestSchema>;

type WithdrawControllerResponse = {
  status: number;
  body: Record<string, unknown>;
  errorCode?: string;
};

function jsonResult(result: WithdrawControllerResponse): Response {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (result.errorCode) {
    headers.set("x-error-code", result.errorCode);
  }

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  });
}

function parseUserId(headers: Headers): string | null {
  const userId = headers.get("x-user-id")?.trim() ?? headers.get("user-id")?.trim();

  if (!userId) {
    return null;
  }

  return userId;
}

export type PostWalletWithdrawHandlerDependencies = {
  withdrawService: Pick<WithdrawService, "withdrawWallet">;
};

export function createPostWalletWithdrawHandler(
  dependencies: PostWalletWithdrawHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    try {
      const userId = parseUserId(request.headers);

      if (!userId) {
        return jsonResult({
          status: 400,
          errorCode: WALLET_USER_ID_REQUIRED_CODE,
          body: {
            error_code: WALLET_USER_ID_REQUIRED_CODE,
            message: "x-user-id header is required",
          },
        });
      }

      let requestBody: unknown;

      try {
        requestBody = await request.json();
      } catch {
        return jsonResult({
          status: 400,
          errorCode: WALLET_INVALID_WITHDRAW_REQUEST_CODE,
          body: {
            error_code: WALLET_INVALID_WITHDRAW_REQUEST_CODE,
            message: "Request body must be valid JSON",
          },
        });
      }

      const parsedBody = withdrawRequestSchema.safeParse(requestBody);

      if (!parsedBody.success) {
        return jsonResult({
          status: 400,
          errorCode: WALLET_INVALID_WITHDRAW_REQUEST_CODE,
          body: {
            error_code: WALLET_INVALID_WITHDRAW_REQUEST_CODE,
            message: parsedBody.error.issues.map((issue) => issue.message).join("; "),
          },
        });
      }

      const payload: WithdrawRequestPayload = parsedBody.data;

      const result = await dependencies.withdrawService.withdrawWallet(userId, payload.amount);

      return jsonResult({
        status: 200,
        body: {
          result: "accepted",
          wallet_id: result.walletId,
          user_id: result.userId,
          amount: result.amount,
          balance: result.balance,
          ledger_id: result.ledgerId,
        },
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return jsonResult({
          status: error.status,
          errorCode: error.code,
          body: {
            error_code: error.code,
            message: error.message,
          },
        });
      }

      return jsonResult({
        status: 500,
        errorCode: WALLET_INTERNAL_ERROR_CODE,
        body: {
          error_code: WALLET_INTERNAL_ERROR_CODE,
          message: "Unexpected internal error",
        },
      });
    }
  };
}

const defaultWithdrawService = createWithdrawService(prismaSqlTransactionRunner);

export const postWalletWithdrawHandler = createPostWalletWithdrawHandler({
  withdrawService: defaultWithdrawService,
});

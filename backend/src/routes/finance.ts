import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../db";
import { loadBuyerAccessContext, requireAuth } from "../lib/auth";

type DecimalLike =
  | number
  | string
  | bigint
  | null
  | undefined
  | {
      toNumber?: () => number;
      valueOf?: () => unknown;
      toString?: () => string;
    };

const invoiceParamsSchema = z.object({
  invoiceId: z.string().trim().min(1),
});

async function toNumberValue(value: DecimalLike): Promise<number> {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  if (value && typeof value === "object" && typeof value.valueOf === "function") {
    const rawValue = value.valueOf();

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      const parsed = Number(rawValue);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  if (value && typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("Unable to convert value to number");
}

async function sendUnauthorized(reply: FastifyReply): Promise<void> {
  await reply.code(401).send({
    error: "Unauthorized",
  });
}

async function sendValidationError(
  reply: FastifyReply,
  issues: Array<{ path: string; message: string }>,
): Promise<void> {
  await reply.code(400).send({
    error: "INVALID_REQUEST",
    issues,
  });
}

function buildLotTitle(
  brand: string | null | undefined,
  model: string | null | undefined,
  auctionId: string,
): string {
  const parts = [brand?.trim(), model?.trim()].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return `Lot ${auctionId.slice(0, 8).toUpperCase()}`;
}

function buildLotNumber(auctionId: string): string {
  return `Lot ${auctionId.slice(0, 8).toUpperCase()}`;
}

export async function financeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", requireAuth);

  fastify.get(
    "/finance/invoices",
    async function financeInvoicesListHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const buyerContext = await loadBuyerAccessContext(request);

      if (!buyerContext) {
        await sendUnauthorized(reply);
        return;
      }

      const invoices = await prisma.invoice.findMany({
        where: {
          buyerCompanyId: buyerContext.companyId,
        },
        orderBy: [{ dueAt: "asc" }, { issuedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          auctionId: true,
          total: true,
          status: true,
          issuedAt: true,
          dueAt: true,
          auction: {
            select: {
              id: true,
              vehicle: {
                select: {
                  brand: true,
                  model: true,
                },
              },
            },
          },
        },
      });

      await reply.code(200).send({
        invoices: await Promise.all(
          invoices.map(async (invoice) => ({
            id: invoice.id,
            invoiceId: invoice.id,
            auctionId: invoice.auctionId,
            lotNumber: buildLotNumber(invoice.auctionId),
            lotTitle: buildLotTitle(
              invoice.auction.vehicle?.brand,
              invoice.auction.vehicle?.model,
              invoice.auction.id,
            ),
            total: await toNumberValue(invoice.total),
            status: invoice.status,
            issuedAt: invoice.issuedAt.toISOString(),
            dueAt: invoice.dueAt.toISOString(),
          })),
        ),
      });
    },
  );

  fastify.get<{ Params: unknown }>(
    "/finance/invoices/:invoiceId",
    async function financeInvoiceDetailHandler(
      request: FastifyRequest<{ Params: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const buyerContext = await loadBuyerAccessContext(request);

      if (!buyerContext) {
        await sendUnauthorized(reply);
        return;
      }

      const parsedParams = invoiceParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(
          reply,
          parsedParams.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const invoice = await prisma.invoice.findFirst({
        where: {
          id: parsedParams.data.invoiceId,
          buyerCompanyId: buyerContext.companyId,
        },
        select: {
          id: true,
          auctionId: true,
          subtotal: true,
          commission: true,
          vat: true,
          total: true,
          status: true,
          issuedAt: true,
          dueAt: true,
          auction: {
            select: {
              id: true,
              vehicle: {
                select: {
                  brand: true,
                  model: true,
                },
              },
            },
          },
        },
      });

      if (!invoice) {
        await reply.code(404).send({
          error: "INVOICE_NOT_FOUND",
        });
        return;
      }

      const winningBid = await toNumberValue(invoice.subtotal);
      const commission = await toNumberValue(invoice.commission);
      const vat = await toNumberValue(invoice.vat);
      const total = await toNumberValue(invoice.total);
      const docFee = Math.max(total - winningBid - commission - vat, 0);

      await reply.code(200).send({
        invoice: {
          id: invoice.id,
          invoiceId: invoice.id,
          auctionId: invoice.auctionId,
          lotNumber: buildLotNumber(invoice.auctionId),
          lotTitle: buildLotTitle(
            invoice.auction.vehicle?.brand,
            invoice.auction.vehicle?.model,
            invoice.auction.id,
          ),
          winningBid,
          commission,
          vat,
          docFee,
          total,
          status: invoice.status,
          issuedAt: invoice.issuedAt.toISOString(),
          dueAt: invoice.dueAt.toISOString(),
        },
      });
    },
  );

  fastify.post<{ Params: unknown }>(
    "/finance/invoices/:invoiceId/pay",
    async function financeInvoicePayHandler(
      request: FastifyRequest<{ Params: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const buyerContext = await loadBuyerAccessContext(request);

      if (!buyerContext) {
        await sendUnauthorized(reply);
        return;
      }

      const parsedParams = invoiceParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        await sendValidationError(
          reply,
          parsedParams.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const paymentResponse = await request.server.inject({
        method: "POST",
        url: `/api/payments/invoices/${parsedParams.data.invoiceId}/intent`,
        headers: {
          authorization: request.headers.authorization ?? "",
          cookie: request.headers.cookie ?? "",
          "idempotency-key":
            request.headers["idempotency-key"]?.toString().trim() ?? randomUUID(),
        },
        payload: {},
      });

      let parsedBody: unknown = null;

      try {
        parsedBody = JSON.parse(paymentResponse.body);
      } catch {
        parsedBody = paymentResponse.body;
      }

      await reply.code(paymentResponse.statusCode).send(parsedBody);
    },
  );
}

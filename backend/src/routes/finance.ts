import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import puppeteer from "puppeteer";
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatInvoiceDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  }).format(value);
}

export function formatInvoiceDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dubai",
  })
    .format(value)
    .replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase());
}

export function formatInvoiceAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function buildInvoicePdfHtml(input: {
  invoiceId: string;
  invoiceNumber: string;
  issuedAt: string;
  statusClass: string;
  statusLabel: string;
  lotTitle: string;
  lotNumber: string;
  closedAt: string;
  subtotal: string;
  commissionPct: string;
  commission: string;
  vat: string;
  total: string;
  dueAt: string;
  buyerCompanyName: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1f2933;
         padding: 48px; font-size: 14px; }
  .header { display: flex; justify-content: space-between;
            align-items: flex-start; margin-bottom: 40px; }
  .logo { font-size: 24px; font-weight: 800; color: #116a43; }
  .logo span { font-size: 12px; color: #556270;
               display: block; font-weight: 400; margin-top: 4px; }
  .invoice-meta { text-align: right; }
  .invoice-meta h1 { font-size: 20px; font-weight: 700;
                     color: #116a43; margin-bottom: 8px; }
  .invoice-meta p { font-size: 12px; color: #556270; line-height: 1.6; }
  .divider { border: none; border-top: 1px solid #dde3ea;
             margin: 24px 0; }
  .section-title { font-size: 11px; font-weight: 700;
                   color: #9aa5b1; text-transform: uppercase;
                   letter-spacing: 0.08em; margin-bottom: 12px; }
  .lot-info { background: #f9fafb; border-radius: 8px;
              padding: 20px; margin-bottom: 24px; }
  .lot-info h2 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .lot-info p { font-size: 13px; color: #556270; }
  .line-items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  .line-items th { text-align: left; font-size: 11px; color: #9aa5b1;
                   text-transform: uppercase; letter-spacing: 0.06em;
                   padding: 8px 0; border-bottom: 1px solid #dde3ea; }
  .line-items td { padding: 12px 0; border-bottom: 1px solid #f3f5f7;
                   font-size: 14px; }
  .line-items .total-row td { font-weight: 700; font-size: 16px;
                               border-top: 2px solid #dde3ea;
                               border-bottom: none; padding-top: 16px; }
  .line-items .amount { text-align: right; }
  .status-badge { display: inline-block; padding: 4px 12px;
                  border-radius: 999px; font-size: 12px;
                  font-weight: 700; }
  .status-pending { background: #f6ead4; color: #9b6914; }
  .status-paid { background: #e8f4ee; color: #116a43; }
  .footer { margin-top: 48px; padding-top: 24px;
            border-top: 1px solid #dde3ea;
            display: flex; justify-content: space-between; }
  .footer p { font-size: 11px; color: #9aa5b1; line-height: 1.6; }
  .due-box { background: #f9fafb; border: 1px solid #dde3ea;
             border-radius: 8px; padding: 16px 20px;
             margin-bottom: 24px; display: flex;
             justify-content: space-between; align-items: center; }
  .due-box .label { font-size: 12px; color: #556270; }
  .due-box .value { font-size: 16px; font-weight: 700; color: #1f2933; }
</style>
</head>
<body>

<div class="header">
  <div class="logo">
    FleetBid
    <span>UAE B2B Vehicle Auction Platform</span>
  </div>
  <div class="invoice-meta">
    <h1>INVOICE</h1>
    <p>
      Invoice #: ${escapeHtml(input.invoiceNumber)}<br>
      Issued: ${escapeHtml(input.issuedAt)}<br>
      Status: <span class="status-badge ${escapeHtml(input.statusClass)}">${escapeHtml(input.statusLabel)}</span>
    </p>
  </div>
</div>

<hr class="divider">

<div class="lot-info">
  <p class="section-title">Vehicle</p>
  <h2>${escapeHtml(input.lotTitle)}</h2>
  <p>Lot #${escapeHtml(input.lotNumber)} · Auction closed ${escapeHtml(input.closedAt)}</p>
</div>

<p class="section-title">Invoice Breakdown</p>
<table class="line-items">
  <thead>
    <tr>
      <th>Description</th>
      <th class="amount">Amount (AED)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Vehicle purchase price</td>
      <td class="amount">${escapeHtml(input.subtotal)}</td>
    </tr>
    <tr>
      <td>Platform commission (${escapeHtml(input.commissionPct)}%)</td>
      <td class="amount">${escapeHtml(input.commission)}</td>
    </tr>
    <tr>
      <td>VAT (5%)</td>
      <td class="amount">${escapeHtml(input.vat)}</td>
    </tr>
    <tr class="total-row">
      <td>Total Due</td>
      <td class="amount">AED ${escapeHtml(input.total)}</td>
    </tr>
  </tbody>
</table>

<div class="due-box">
  <div>
    <div class="label">Payment Due By</div>
    <div class="value">${escapeHtml(input.dueAt)}</div>
  </div>
  <div style="text-align:right">
    <div class="label">Buyer Company</div>
    <div class="value">${escapeHtml(input.buyerCompanyName)}</div>
  </div>
</div>

<div class="footer">
  <p>
    FleetBid Technologies FZE<br>
    Dubai Silicon Oasis · UAE<br>
    TL: AE-DXB-2022-88441 · VAT: 100234567800003
  </p>
  <p style="text-align:right">
    Questions? contact@fleetbid.ae<br>
    This is an official tax invoice.<br>
    Invoice ID: ${escapeHtml(input.invoiceId)}
  </p>
</div>

</body>
</html>`;
}

export async function renderInvoicePdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
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

  fastify.get<{ Params: unknown }>(
    "/finance/invoices/:invoiceId/pdf",
    async function financeInvoicePdfHandler(
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
          buyerCompanyId: true,
          subtotal: true,
          commission: true,
          vat: true,
          total: true,
          currency: true,
          status: true,
          issuedAt: true,
          dueAt: true,
          auction: {
            select: {
              id: true,
              closedAt: true,
              endsAt: true,
              vehicle: {
                select: {
                  brand: true,
                  model: true,
                  year: true,
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

      const buyerCompany = await prisma.company.findUnique({
        where: {
          id: invoice.buyerCompanyId,
        },
        select: {
          name: true,
        },
      });

      const subtotal = await toNumberValue(invoice.subtotal);
      const commission = await toNumberValue(invoice.commission);
      const vat = await toNumberValue(invoice.vat);
      const total = await toNumberValue(invoice.total);
      const invoiceNumber = invoice.id.slice(0, 8).toUpperCase();
      const normalizedStatus = invoice.status.trim().toUpperCase();
      const isPaid = normalizedStatus === "PAID" || normalizedStatus === "CONFIRMED";
      const lotTitle = [
        invoice.auction.vehicle?.brand?.trim(),
        invoice.auction.vehicle?.model?.trim(),
        invoice.auction.vehicle?.year?.toString(),
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" ");
      const closedAtSource = invoice.auction.closedAt ?? invoice.auction.endsAt ?? invoice.issuedAt;
      const commissionPct = subtotal > 0 ? ((commission / subtotal) * 100).toFixed(0) : "0";
      const html = buildInvoicePdfHtml({
        invoiceNumber,
        issuedAt: formatInvoiceDate(invoice.issuedAt),
        statusClass: isPaid ? "status-paid" : "status-pending",
        statusLabel: isPaid ? "Paid" : "Payment Pending",
        lotTitle: lotTitle || buildLotTitle(
          invoice.auction.vehicle?.brand,
          invoice.auction.vehicle?.model,
          invoice.auction.id,
        ),
        lotNumber: invoice.auctionId.slice(0, 8).toUpperCase(),
        closedAt: formatInvoiceDate(closedAtSource),
        subtotal: formatInvoiceAmount(subtotal),
        commissionPct,
        commission: formatInvoiceAmount(commission),
        vat: formatInvoiceAmount(vat),
        total: formatInvoiceAmount(total),
        dueAt: formatInvoiceDateTime(invoice.dueAt),
        buyerCompanyName: buyerCompany?.name?.trim() || "Buyer Company",
        invoiceId: invoice.id,
      });
      const pdfBuffer = await renderInvoicePdf(html);

      await reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="invoice-${invoiceNumber}.pdf"`)
        .send(pdfBuffer);
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

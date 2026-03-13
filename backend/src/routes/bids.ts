import { createHash } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../db";
import { requireAuth } from "../lib/auth";

type DecimalLike =
  | number
  | string
  | bigint
  | null
  | undefined
  | {
      toNumber?: () => number;
      valueOf?: () => unknown;
    };

type JsonRecord = Record<string, unknown>;

type AuctionLockRow = {
  id: string;
  state: string;
  version: number;
  current_price: DecimalLike;
  min_increment: DecimalLike;
  last_bid_sequence: number;
  ends_at: Date | string;
};

const placeBidSchema = z.object({
  auctionId: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  idempotencyKey: z.string().trim().min(1),
});

const auctionParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const auctionBidsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().trim().min(1).optional(),
});

async function computeBidRequestExpiry(referenceDate: Date): Promise<Date> {
  const expiresAt = new Date(referenceDate);

  expiresAt.setUTCDate(expiresAt.getUTCDate() + 90);

  return expiresAt;
}

async function createBidRequestHash(input: {
  auctionId: string;
  amount: number;
  companyId: string;
  userId: string;
}): Promise<string> {
  return createHash("sha256")
    .update(
      JSON.stringify({
        auctionId: input.auctionId,
        amount: input.amount,
        companyId: input.companyId,
        userId: input.userId,
      }),
    )
    .digest("hex");
}

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

  throw new Error("Unable to convert value to number");
}

async function toIsoString(value: Date | string | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Unable to convert value to date");
  }

  return parsed.toISOString();
}

async function toDateValue(value: Date | string): Promise<Date> {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Unable to convert value to date");
  }

  return parsed;
}

async function readStoredResponseBody(value: unknown): Promise<JsonRecord> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      return {};
    }
  }

  return {};
}

async function toStoredJson(value: unknown): Promise<any> {
  return JSON.parse(JSON.stringify(value));
}

async function sendValidationError(
  reply: FastifyReply,
  issues: Array<{ path: string; message: string }>,
): Promise<void> {
  await reply.code(400).send({
    error: "Invalid request",
    issues,
  });
}

async function sendUnauthorized(reply: FastifyReply): Promise<void> {
  await reply.code(401).send({
    error: "Unauthorized",
  });
}

async function mapBidError(error: unknown): Promise<{
  statusCode: number;
  body: JsonRecord;
  bidRequestStatus: "REJECTED" | "FAILED";
}> {
  if (error instanceof Error && error.message === "AUCTION_NOT_LIVE") {
    return {
      statusCode: 409,
      body: {
        error: "Auction is not active",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  if (error instanceof Error && error.message === "BID_TOO_LOW") {
    return {
      statusCode: 422,
      body: {
        error: "Bid must be higher than current price",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  if (error instanceof Error && error.message === "BID_INCREMENT_VIOLATION") {
    return {
      statusCode: 422,
      body: {
        error: "Bid must meet the minimum increment",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  if (error instanceof Error && error.message === "AUCTION_ENDED") {
    return {
      statusCode: 409,
      body: {
        error: "Auction has ended",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  if (error instanceof Error && error.message === "NO_DEPOSIT") {
    return {
      statusCode: 403,
      body: {
        error: "Deposit required to bid",
      },
      bidRequestStatus: "REJECTED",
    };
  }

  return {
    statusCode: 500,
    body: {
      error: "Internal server error",
    },
    bidRequestStatus: "FAILED",
  };
}

async function serializeBid(bid: {
  id: string;
  amount: DecimalLike;
  sequenceNo: number;
  createdAt: Date;
  auctionId?: string;
  companyId?: string;
  userId?: string;
}): Promise<JsonRecord> {
  return {
    id: bid.id,
    ...(bid.auctionId ? { auctionId: bid.auctionId } : {}),
    ...(bid.companyId ? { companyId: bid.companyId } : {}),
    ...(bid.userId ? { userId: bid.userId } : {}),
    amount: await toNumberValue(bid.amount),
    sequenceNo: bid.sequenceNo,
    createdAt: bid.createdAt.toISOString(),
  };
}

async function serializeVehicle(vehicle: {
  id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
  marketPrice: DecimalLike | null;
  fuelType: string | null;
  transmission: string | null;
  bodyType: string | null;
  regionSpec: string | null;
  condition: string | null;
  serviceHistory: string | null;
  description: string | null;
  engine: string | null;
  driveType: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  airbags: string | null;
  damage: string | null;
  damageMap: unknown;
  images: string[];
}): Promise<JsonRecord> {
  return {
    id: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    mileage: vehicle.mileage,
    vin: vehicle.vin,
    marketPrice: vehicle.marketPrice === null ? null : await toNumberValue(vehicle.marketPrice),
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    bodyType: vehicle.bodyType,
    regionSpec: vehicle.regionSpec,
    condition: vehicle.condition,
    serviceHistory: vehicle.serviceHistory,
    description: vehicle.description,
    engine: vehicle.engine,
    driveType: vehicle.driveType,
    exteriorColor: vehicle.exteriorColor,
    interiorColor: vehicle.interiorColor,
    airbags: vehicle.airbags,
    damage: vehicle.damage,
    damageMap: vehicle.damageMap,
    images: vehicle.images,
  };
}

export async function bidsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/bids",
    {
      preHandler: requireAuth,
    },
    async function placeBidHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedBody = placeBidSchema.safeParse(request.body);

      if (!parsedBody.success) {
        await sendValidationError(
          reply,
          parsedBody.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const userId = request.auth?.userId;
      const companyId = request.auth?.companyId;

      if (!userId || !companyId) {
        await sendUnauthorized(reply);
        return;
      }

      const payload = parsedBody.data;
      const requestHash = await createBidRequestHash({
        auctionId: payload.auctionId,
        amount: payload.amount,
        companyId,
        userId,
      });
      const existingRequest = await prisma.bidRequest.findUnique({
        where: {
          auctionId_companyId_idempotencyKey: {
            auctionId: payload.auctionId,
            companyId,
            idempotencyKey: payload.idempotencyKey,
          },
        },
      });

      if (existingRequest) {
        if (existingRequest.requestHash !== requestHash) {
          await reply.code(409).send({
            error: "Idempotency key already used for a different bid",
          });
          return;
        }

        if (
          existingRequest.status === "SUCCEEDED" &&
          existingRequest.responseStatus !== null &&
          existingRequest.responseBody
        ) {
          fastify.log.info(
            {
              auctionId: payload.auctionId,
              amount: payload.amount,
              companyId,
              bidRequestId: existingRequest.id,
            },
            "Bid replayed from idempotency cache",
          );

          await reply
            .code(existingRequest.responseStatus)
            .send(await readStoredResponseBody(existingRequest.responseBody));
          return;
        }

        if (
          (existingRequest.status === "REJECTED" || existingRequest.status === "FAILED") &&
          existingRequest.responseStatus !== null &&
          existingRequest.responseBody
        ) {
          await reply
            .code(existingRequest.responseStatus)
            .send(await readStoredResponseBody(existingRequest.responseBody));
          return;
        }

        await reply.code(409).send({
          error: "Bid request already in progress",
        });
        return;
      }

      const expiresAt = await computeBidRequestExpiry(new Date());
      let bidRequestId: string | null = null;

      try {
        const bidRequest = await prisma.bidRequest.create({
          data: {
            auctionId: payload.auctionId,
            companyId,
            idempotencyKey: payload.idempotencyKey,
            requestHash,
            status: "IN_PROGRESS",
            expiresAt,
          },
        });

        bidRequestId = bidRequest.id;
      } catch (error) {
        const racedRequest = await prisma.bidRequest.findUnique({
          where: {
            auctionId_companyId_idempotencyKey: {
              auctionId: payload.auctionId,
              companyId,
              idempotencyKey: payload.idempotencyKey,
            },
          },
        });

        if (
          racedRequest &&
          racedRequest.requestHash === requestHash &&
          racedRequest.responseStatus !== null &&
          racedRequest.responseBody
        ) {
          await reply
            .code(racedRequest.responseStatus)
            .send(await readStoredResponseBody(racedRequest.responseBody));
          return;
        }

        throw error;
      }

      fastify.log.info(
        {
          auctionId: payload.auctionId,
          amount: payload.amount,
          companyId,
          userId,
          bidRequestId,
        },
        "Bid placement requested",
      );

      try {
        const bid = await prisma.$transaction(
          async (tx) => {
            const rows = await tx.$queryRaw<AuctionLockRow[]>`
              SELECT
                id,
                state,
                version,
                current_price,
                min_increment,
                last_bid_sequence,
                ends_at
              FROM auctions
              WHERE id = ${payload.auctionId}
              FOR UPDATE
            `;
            const auction = rows[0];

            if (!auction) {
              throw new Error("AUCTION_NOT_LIVE");
            }

            const currentPrice = await toNumberValue(auction.current_price);
            const minIncrement = await toNumberValue(auction.min_increment);
            const endsAt = await toDateValue(auction.ends_at);

            if (auction.state !== "LIVE" && auction.state !== "EXTENDED") {
              throw new Error("AUCTION_NOT_LIVE");
            }

            if (payload.amount <= currentPrice) {
              throw new Error("BID_TOO_LOW");
            }

            if (payload.amount < currentPrice + minIncrement) {
              throw new Error("BID_INCREMENT_VIOLATION");
            }

            if (new Date() > endsAt) {
              throw new Error("AUCTION_ENDED");
            }

            const depositLock = await tx.depositLock.findFirst({
              where: {
                auctionId: payload.auctionId,
                companyId,
                status: "ACTIVE",
              },
            });

            if (!depositLock) {
              throw new Error("NO_DEPOSIT");
            }

            const nextSequenceNo = auction.last_bid_sequence + 1;
            const bidRecord = await tx.bid.create({
              data: {
                auctionId: payload.auctionId,
                companyId,
                userId,
                amount: payload.amount,
                sequenceNo: nextSequenceNo,
              },
            });
            const updatedRows = await tx.$executeRaw`
              UPDATE auctions
              SET current_price = ${payload.amount},
                  last_bid_sequence = ${nextSequenceNo},
                  highest_bid_id = ${bidRecord.id},
                  version = version + 1
              WHERE id = ${payload.auctionId} AND version = ${auction.version}
            `;

            if (updatedRows !== 1) {
              throw new Error("AUCTION_VERSION_CONFLICT");
            }

            const timeLeft = endsAt.getTime() - Date.now();

            if (timeLeft < 3 * 60 * 1000) {
              await tx.$executeRaw`
                UPDATE auctions
                SET ends_at = NOW() + INTERVAL '3 minutes',
                    extension_count = extension_count + 1
                WHERE id = ${payload.auctionId}
              `;
            }

            return bidRecord;
          },
          {
            isolationLevel: "Serializable",
          },
        );
        const responseBody = {
          bid: await serializeBid({
            id: bid.id,
            amount: bid.amount,
            sequenceNo: bid.sequenceNo,
            createdAt: bid.createdAt,
          }),
        };

        await prisma.bidRequest.update({
          where: {
            id: bidRequestId,
          },
          data: {
            status: "SUCCEEDED",
            responseStatus: 201,
            responseBody: await toStoredJson(responseBody),
            bidId: bid.id,
          },
        });

        fastify.log.info(
          {
            auctionId: payload.auctionId,
            amount: payload.amount,
            companyId,
            userId,
            bidId: bid.id,
          },
          "Bid placed successfully",
        );

        await reply.code(201).send(responseBody);
      } catch (error) {
        const mappedError = await mapBidError(error);

        if (bidRequestId) {
          await prisma.bidRequest.update({
            where: {
              id: bidRequestId,
            },
            data: {
              status: mappedError.bidRequestStatus,
              responseStatus: mappedError.statusCode,
              responseBody: await toStoredJson(mappedError.body),
            },
          });
        }

        if (mappedError.statusCode === 500) {
          fastify.log.error(
            {
              err: error,
              auctionId: payload.auctionId,
              amount: payload.amount,
              companyId,
              userId,
            },
            "Bid placement failed",
          );
        }

        await reply.code(mappedError.statusCode).send(mappedError.body);
      }
    },
  );

  fastify.get(
    "/auctions/:id/bids",
    async function listAuctionBidsHandler(
      request: FastifyRequest<{
        Params: unknown;
        Querystring: unknown;
      }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = auctionParamsSchema.safeParse(request.params);

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

      const parsedQuery = auctionBidsQuerySchema.safeParse(request.query ?? {});

      if (!parsedQuery.success) {
        await sendValidationError(
          reply,
          parsedQuery.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        return;
      }

      const { id } = parsedParams.data;
      const { cursor, limit } = parsedQuery.data;
      const bids = await prisma.bid.findMany({
        where: {
          auctionId: id,
        },
        take: limit + 1,
        ...(cursor
          ? {
              skip: 1,
              cursor: {
                id: cursor,
              },
            }
          : {}),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const hasNextPage = bids.length > limit;
      const pageItems = hasNextPage ? bids.slice(0, limit) : bids;
      const nextCursor = hasNextPage ? pageItems[pageItems.length - 1]?.id ?? null : null;

      await reply.code(200).send({
        bids: await Promise.all(
          pageItems.map(async (bid) =>
            serializeBid({
              id: bid.id,
              auctionId: bid.auctionId,
              companyId: bid.companyId,
              userId: bid.userId,
              amount: bid.amount,
              sequenceNo: bid.sequenceNo,
              createdAt: bid.createdAt,
            }),
          ),
        ),
        nextCursor,
      });
    },
  );

  fastify.get(
    "/auctions/:id",
    async function getAuctionHandler(
      request: FastifyRequest<{ Params: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const parsedParams = auctionParamsSchema.safeParse(request.params);

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

      const auction = await prisma.auction.findUnique({
        where: {
          id: parsedParams.data.id,
        },
        include: {
          vehicle: true,
          bids: {
            take: 10,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          },
        },
      });

      if (!auction) {
        await reply.code(404).send({
          error: "Auction not found",
        });
        return;
      }

      await reply.code(200).send({
        auction: {
          id: auction.id,
          state: auction.state,
          version: auction.version,
          currentPrice: await toNumberValue(auction.currentPrice),
          minIncrement: await toNumberValue(auction.minIncrement),
          startingPrice: await toNumberValue(auction.startingPrice),
          buyNowPrice: auction.buyNowPrice === null ? null : await toNumberValue(auction.buyNowPrice),
          startsAt: await toIsoString(auction.startsAt),
          endsAt: await toIsoString(auction.endsAt),
          extensionCount: auction.extensionCount,
          highestBidId: auction.highestBidId,
          vehicle: await serializeVehicle(auction.vehicle),
          bids: await Promise.all(
            auction.bids.map(async (bid) =>
              serializeBid({
                id: bid.id,
                auctionId: bid.auctionId,
                companyId: bid.companyId,
                userId: bid.userId,
                amount: bid.amount,
                sequenceNo: bid.sequenceNo,
                createdAt: bid.createdAt,
              }),
            ),
          ),
        },
      });
    },
  );
}

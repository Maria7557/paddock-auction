export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";

import { AuctionState, Prisma } from "@prisma/client";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";

const createAuctionSchema = z.object({
  vehicleId: z.string().uuid(),
  startingPrice: z.number().positive(),
  reservePrice: z.number().positive().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const allowedListStates = new Set<AuctionState>(["LIVE", "SCHEDULED"]);

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

function createPayloadHash(payload: Prisma.InputJsonValue): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function parseAuctionStateFilter(request: Request): AuctionState[] | Response {
  const url = new URL(request.url);
  const stateParams = url.searchParams.getAll("state").map((value) => value.trim().toUpperCase());

  if (stateParams.length === 0) {
    return ["LIVE", "SCHEDULED"];
  }

  const states: AuctionState[] = [];

  for (const state of stateParams) {
    if (!allowedListStates.has(state as AuctionState)) {
      return json(400, {
        error: "INVALID_STATE_FILTER",
        message: "Only LIVE and SCHEDULED states are supported for listing",
      });
    }

    states.push(state as AuctionState);
  }

  return states;
}

export const POST = withStructuredMutationLogging(async (request: Request): Promise<Response> => {
  const userRole = request.headers.get("x-user-role")?.trim();

  if (userRole !== "SELLER") {
    return json(403, {
      error: "SELLERS_ONLY",
    });
  }

  const actorId = request.headers.get("x-user-id")?.trim();
  const companyId = request.headers.get("x-company-id")?.trim();

  if (!actorId || !companyId) {
    return json(401, {
      error: "UNAUTHORIZED",
    });
  }

  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return json(400, {
      error: "INVALID_REQUEST",
      message: "Request body must be valid JSON",
    });
  }

  const parsed = createAuctionSchema.safeParse(requestBody);

  if (!parsed.success) {
    return json(400, {
      error: "INVALID_REQUEST",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const payload = parsed.data;
  const startsAt = new Date(payload.startsAt);
  const endsAt = new Date(payload.endsAt);
  const now = new Date();

  if (!(startsAt.getTime() > now.getTime())) {
    return json(400, {
      error: "INVALID_AUCTION_WINDOW",
      message: "startsAt must be in the future",
    });
  }

  if (!(endsAt.getTime() > startsAt.getTime())) {
    return json(400, {
      error: "INVALID_AUCTION_WINDOW",
      message: "endsAt must be after startsAt",
    });
  }

  const durationMs = endsAt.getTime() - startsAt.getTime();
  const minDurationMs = 60 * 60 * 1000;
  const maxDurationMs = 7 * 24 * 60 * 60 * 1000;

  if (durationMs < minDurationMs || durationMs > maxDurationMs) {
    return json(400, {
      error: "INVALID_AUCTION_WINDOW",
      message: "Auction duration must be between 1 hour and 7 days",
    });
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: {
      id: payload.vehicleId,
    },
    select: {
      id: true,
    },
  });

  if (!vehicle) {
    return json(404, {
      error: "VEHICLE_NOT_FOUND",
    });
  }

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      status: true,
    },
  });

  if (!company) {
    return json(404, {
      error: "COMPANY_NOT_FOUND",
    });
  }

  if (company.status !== "ACTIVE") {
    return json(403, {
      error: "COMPANY_NOT_APPROVED",
      message: "Your company is pending approval. Vehicle saved as draft.",
    });
  }

  const correlationId = request.headers.get("x-correlation-id")?.trim();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();

  const created = await prisma.$transaction(async (tx) => {
    const auctionId = randomUUID();

    const auction = await tx.auction.create({
      data: {
        id: auctionId,
        vehicleId: payload.vehicleId,
        sellerCompanyId: companyId,
        currentPrice: new Prisma.Decimal(payload.startingPrice),
        startsAt,
        endsAt,
        state: "DRAFT",
        version: 1,
      },
    });

    const auditPayload: Prisma.InputJsonValue = {
      auctionId: auction.id,
      vehicleId: payload.vehicleId,
      sellerCompanyId: companyId,
      startingPrice: payload.startingPrice,
      reservePrice: payload.reservePrice ?? null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };

    await tx.auditLog.create({
      data: {
        actorId,
        action: "AUCTION_CREATED",
        entityType: "Auction",
        entityId: auction.id,
        correlationId,
        idempotencyKey,
        payloadHash: createPayloadHash(auditPayload),
        payload: auditPayload,
      },
    });

    return auction;
  });

  return json(201, {
    auctionId: created.id,
    state: created.state,
    vehicleId: created.vehicleId,
    startsAt: created.startsAt.toISOString(),
    endsAt: created.endsAt.toISOString(),
  });
});

export async function GET(request: Request): Promise<Response> {
  const statesOrError = parseAuctionStateFilter(request);

  if (statesOrError instanceof Response) {
    return statesOrError;
  }

  const auctions = await prisma.auction.findMany({
    where: {
      state: {
        in: statesOrError,
      },
    },
    orderBy: [{ endsAt: "asc" }, { id: "asc" }],
  });

  const vehicleIds = [...new Set(auctions.map((auction) => auction.vehicleId))];

  const vehicles = vehicleIds.length
    ? await prisma.vehicle.findMany({
        where: {
          id: {
            in: vehicleIds,
          },
        },
      })
    : [];

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  return json(200, {
    auctions: auctions.map((auction) => {
      const vehicle = vehicleById.get(auction.vehicleId);

      return {
        id: auction.id,
        state: auction.state,
        vehicleId: auction.vehicleId,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              vin: vehicle.vin,
              brand: vehicle.brand,
              model: vehicle.model,
              year: vehicle.year,
              mileage: vehicle.mileage,
            }
          : null,
        currentBid: decimalToNumber(auction.currentPrice),
        startsAt: auction.startsAt.toISOString(),
        endsAt: auction.endsAt.toISOString(),
      };
    }),
  });
}

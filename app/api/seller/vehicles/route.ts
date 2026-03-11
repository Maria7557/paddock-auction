export const runtime = "nodejs";

import { AuctionState, Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

const createSellerVehicleSchema = z.object({
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.coerce.number().int().min(1990).max(2100),
  vin: z.string().trim().min(5).max(64),
  regionSpec: z.string().trim().min(1),
  bodyType: z.string().trim().min(1),
  fuelType: z.string().trim().min(1),
  transmission: z.string().trim().min(1),
  color: z.string().trim().min(1),
  mileageKm: z.coerce.number().int().nonnegative(),
  condition: z.string().trim().min(1),
  serviceHistory: z.string().trim().min(1),
  description: z.string().trim().optional(),
  sellerNotes: z.string().trim().optional(),
  startingPriceAed: z.coerce.number().positive(),
  reservePriceAed: z.coerce.number().positive().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

type VehicleListItem = {
  id: string;
  brand: string;
  model: string;
  year: number;
  vin: string;
  mileageKm: number;
  images: string[];
  latestAuction: {
    id: string;
    state: AuctionState;
    createdAt: string;
    startsAt: string;
    endsAt: string;
    currentBidAed: number;
  } | null;
};

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

function matchesStatus(state: AuctionState, status: string): boolean {
  const normalized = status.toUpperCase();

  if (!normalized || normalized === "ALL") {
    return true;
  }

  if (normalized === "ENDED") {
    return ["ENDED", "CLOSED", "PAYMENT_PENDING", "PAID", "DEFAULTED", "CANCELED"].includes(state);
  }

  return state === normalized;
}

function applySort(items: VehicleListItem[], sort: string): VehicleListItem[] {
  if (sort === "oldest") {
    return [...items].sort((a, b) => {
      const aTime = a.latestAuction ? Date.parse(a.latestAuction.createdAt) : 0;
      const bTime = b.latestAuction ? Date.parse(b.latestAuction.createdAt) : 0;
      return aTime - bTime;
    });
  }

  if (sort === "price_asc") {
    return [...items].sort((a, b) => {
      const aPrice = a.latestAuction?.currentBidAed ?? 0;
      const bPrice = b.latestAuction?.currentBidAed ?? 0;
      return aPrice - bPrice;
    });
  }

  if (sort === "price_desc") {
    return [...items].sort((a, b) => {
      const aPrice = a.latestAuction?.currentBidAed ?? 0;
      const bPrice = b.latestAuction?.currentBidAed ?? 0;
      return bPrice - aPrice;
    });
  }

  return [...items].sort((a, b) => {
    const aTime = a.latestAuction ? Date.parse(a.latestAuction.createdAt) : 0;
    const bTime = b.latestAuction ? Date.parse(b.latestAuction.createdAt) : 0;
    return bTime - aTime;
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() ?? "ALL";
  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const sort = searchParams.get("sort")?.trim() ?? "newest";

  const auctions = await prisma.auction.findMany({
    where: {
      sellerCompanyId: auth.companyId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      vehicle: true,
    },
  });

  const latestByVehicle = new Map<string, VehicleListItem>();

  for (const auction of auctions) {
    if (latestByVehicle.has(auction.vehicleId)) {
      continue;
    }

    const vehicle = auction.vehicle;

    if (!vehicle) {
      continue;
    }

    latestByVehicle.set(auction.vehicleId, {
      id: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
      mileageKm: vehicle.mileage,
      images: vehicle.images,
      latestAuction: {
        id: auction.id,
        state: auction.state,
        createdAt: auction.createdAt.toISOString(),
        startsAt: auction.startsAt.toISOString(),
        endsAt: auction.endsAt.toISOString(),
        currentBidAed: decimalToNumber(auction.currentPrice),
      },
    });
  }

  const filtered = [...latestByVehicle.values()].filter((item) => {
    const state = item.latestAuction?.state;

    if (!state || !matchesStatus(state, status)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchable = `${item.brand} ${item.model} ${item.vin}`.toLowerCase();
    return searchable.includes(query);
  });

  const sorted = applySort(filtered, sort);

  return NextResponse.json({
    total: sorted.length,
    vehicles: sorted,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = createSellerVehicleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const startsAt = new Date(payload.startsAt);
  const endsAt = new Date(payload.endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json(
      {
        error: "INVALID_AUCTION_WINDOW",
        message: "endsAt must be after startsAt",
      },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({
        data: {
          brand: payload.brand,
          model: payload.model,
          year: payload.year,
          mileage: payload.mileageKm,
          vin: payload.vin.toUpperCase(),
          regionSpec: payload.regionSpec,
          bodyType: payload.bodyType,
          fuelType: payload.fuelType,
          transmission: payload.transmission,
          exteriorColor: payload.color,
          condition: payload.condition,
          serviceHistory: payload.serviceHistory,
          description: payload.description,
          sellerNotes: payload.sellerNotes,
        },
      });

      const auction = await tx.auction.create({
        data: {
          vehicleId: vehicle.id,
          sellerCompanyId: auth.companyId,
          state: "DRAFT",
          startsAt,
          endsAt,
          startingPrice: payload.startingPriceAed,
          currentPrice: payload.startingPriceAed,
          buyNowPrice: payload.reservePriceAed,
          minIncrement: 500,
        },
      });

      return {
        vehicleId: vehicle.id,
        auctionId: auction.id,
      };
    });

    return NextResponse.json(
      {
        message: "Vehicle added and auction draft created",
        ...created,
      },
      { status: 201 },
    );
  } catch (error) {
    const maybePrisma = error as { code?: string };

    if (maybePrisma.code === "P2002") {
      return NextResponse.json(
        {
          error: "VIN_ALREADY_EXISTS",
          message: `Vehicle with VIN ${payload.vin.toUpperCase()} already exists`,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}

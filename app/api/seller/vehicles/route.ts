export const runtime = "nodejs";

import { AuctionState, Prisma, VehicleMediaType } from "@prisma/client";
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
  airbags: z.enum(["NO_AIRBAGS", "2", "4", "6", "8", "10_PLUS", "UNKNOWN"]),
  color: z.string().trim().min(1),
  mileageKm: z.coerce.number().int().nonnegative(),
  condition: z.string().trim().min(1),
  serviceHistory: z.string().trim().min(1),
  description: z.string().trim().optional(),
  damageMap: z.record(z.string(), z.enum(["MINOR", "MAJOR"])).optional(),
  photoUrls: z.array(z.string().trim().url()).min(10),
  mulkiyaFrontUrl: z.string().trim().url(),
  mulkiyaBackUrl: z.string().trim().url(),
  startingPriceAed: z.coerce.number().positive(),
  buyNowPriceAed: z.coerce.number().positive().optional(),
  inspectionDropoffDate: z.string().trim().min(1),
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

function toUtcDate(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
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
      vehicle: {
        include: {
          media: {
            where: {
              type: "PHOTO",
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              url: true,
            },
          },
        },
      },
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
      images: vehicle.media.length > 0 ? vehicle.media.map((item) => item.url) : vehicle.images,
      latestAuction: {
        id: auction.id,
        state: auction.state,
        createdAt: auction.createdAt.toISOString(),
        startsAt: (auction.auctionStartsAt ?? auction.startsAt).toISOString(),
        endsAt: (auction.auctionEndsAt ?? auction.endsAt).toISOString(),
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
  const dropoffDate = toUtcDate(payload.inspectionDropoffDate);

  if (!dropoffDate) {
    return NextResponse.json(
      {
        error: "INVALID_INSPECTION_DATE",
        message: "inspectionDropoffDate is invalid",
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const maxDate = addDays(tomorrow, 89);

  if (dropoffDate < tomorrow || dropoffDate > maxDate) {
    return NextResponse.json(
      {
        error: "INVALID_INSPECTION_DATE_RANGE",
        message: "inspectionDropoffDate must be between tomorrow and 90 days from today",
      },
      { status: 400 },
    );
  }

  if (payload.buyNowPriceAed !== undefined && payload.buyNowPriceAed <= payload.startingPriceAed) {
    return NextResponse.json(
      {
        error: "INVALID_BUY_NOW",
        message: "buyNowPriceAed must be greater than startingPriceAed",
      },
      { status: 400 },
    );
  }

  const viewingEndsAt = addDays(dropoffDate, 2);
  const auctionStartsAt = addDays(dropoffDate, 2);
  const auctionEndsAt = addDays(dropoffDate, 3);

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
          airbags: payload.airbags,
          condition: payload.condition,
          serviceHistory: payload.serviceHistory,
          description: payload.description,
          damageMap: payload.damageMap,
          images: payload.photoUrls,
        },
      });

      await tx.vehicleMedia.createMany({
        data: [
          ...payload.photoUrls.map((url, index) => ({
            vehicleId: vehicle.id,
            url,
            type: VehicleMediaType.PHOTO,
            sortOrder: index,
          })),
          {
            vehicleId: vehicle.id,
            url: payload.mulkiyaFrontUrl,
            type: VehicleMediaType.MULKIYA_FRONT,
            sortOrder: 0,
          },
          {
            vehicleId: vehicle.id,
            url: payload.mulkiyaBackUrl,
            type: VehicleMediaType.MULKIYA_BACK,
            sortOrder: 0,
          },
        ],
      });

      const auction = await tx.auction.create({
        data: {
          vehicleId: vehicle.id,
          sellerCompanyId: auth.companyId,
          state: "DRAFT",
          startsAt: auctionStartsAt,
          endsAt: auctionEndsAt,
          inspectionDropoffDate: dropoffDate,
          viewingEndsAt,
          auctionStartsAt,
          auctionEndsAt,
          startingPrice: payload.startingPriceAed,
          currentPrice: payload.startingPriceAed,
          buyNowPrice: payload.buyNowPriceAed,
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

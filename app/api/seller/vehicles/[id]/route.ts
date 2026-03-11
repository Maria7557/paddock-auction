export const runtime = "nodejs";

import { AuctionState, Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateVehicleSchema = z.object({
  brand: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  vin: z.string().trim().min(5).max(64).optional(),
  regionSpec: z.string().trim().min(1).optional(),
  bodyType: z.string().trim().min(1).optional(),
  fuelType: z.string().trim().min(1).optional(),
  transmission: z.string().trim().min(1).optional(),
  airbags: z.enum(["NO_AIRBAGS", "2", "4", "6", "8", "10_PLUS", "UNKNOWN"]).optional(),
  color: z.string().trim().min(1).optional(),
  mileageKm: z.coerce.number().int().nonnegative().optional(),
  condition: z.string().trim().min(1).optional(),
  serviceHistory: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  damageMap: z.record(z.string(), z.enum(["MINOR", "MAJOR"])).optional(),
});

function decimalToNumber(value: Prisma.Decimal | null): number {
  if (!value) {
    return 0;
  }

  return Number(value.toString());
}

async function getCompanyAuctionForVehicle(companyId: string, vehicleId: string) {
  return prisma.auction.findFirst({
    where: {
      sellerCompanyId: companyId,
      vehicleId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      vehicle: {
        include: {
          media: {
            orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              type: true,
              url: true,
              sortOrder: true,
            },
          },
        },
      },
      _count: {
        select: {
          bids: true,
        },
      },
    },
  });
}

function isDraftLikeState(state: AuctionState): boolean {
  return state === "DRAFT";
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const auction = await getCompanyAuctionForVehicle(auth.companyId, id);

  if (!auction || !auction.vehicle) {
    return NextResponse.json({ error: "VEHICLE_NOT_FOUND" }, { status: 404 });
  }

  const topBid = await prisma.bid.findFirst({
    where: { auctionId: auction.id },
    orderBy: [{ amount: "desc" }, { createdAt: "desc" }],
    select: {
      amount: true,
    },
  });

  const photoUrls = auction.vehicle.media
    .filter((item) => item.type === "PHOTO")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.url);
  const mulkiyaFrontUrl = auction.vehicle.media.find((item) => item.type === "MULKIYA_FRONT")?.url ?? null;
  const mulkiyaBackUrl = auction.vehicle.media.find((item) => item.type === "MULKIYA_BACK")?.url ?? null;

  return NextResponse.json({
    vehicle: {
      id: auction.vehicle.id,
      brand: auction.vehicle.brand,
      model: auction.vehicle.model,
      year: auction.vehicle.year,
      vin: auction.vehicle.vin,
      mileageKm: auction.vehicle.mileage,
      regionSpec: auction.vehicle.regionSpec,
      bodyType: auction.vehicle.bodyType,
      fuelType: auction.vehicle.fuelType,
      transmission: auction.vehicle.transmission,
      airbags: auction.vehicle.airbags,
      color: auction.vehicle.exteriorColor,
      condition: auction.vehicle.condition,
      serviceHistory: auction.vehicle.serviceHistory,
      description: auction.vehicle.description,
      damageMap: auction.vehicle.damageMap ?? {},
      images: photoUrls.length > 0 ? photoUrls : auction.vehicle.images,
      photoUrls,
      mulkiyaFrontUrl,
      mulkiyaBackUrl,
    },
    auction: {
      id: auction.id,
      state: auction.state,
      startingPriceAed: decimalToNumber(auction.startingPrice),
      buyNowPriceAed: decimalToNumber(auction.buyNowPrice),
      currentBidAed: topBid ? decimalToNumber(topBid.amount) : decimalToNumber(auction.currentPrice),
      startsAt: (auction.auctionStartsAt ?? auction.startsAt).toISOString(),
      endsAt: (auction.auctionEndsAt ?? auction.endsAt).toISOString(),
      inspectionDropoffDate: auction.inspectionDropoffDate?.toISOString() ?? null,
      viewingEndsAt: auction.viewingEndsAt?.toISOString() ?? null,
      auctionStartsAt: auction.auctionStartsAt?.toISOString() ?? null,
      auctionEndsAt: auction.auctionEndsAt?.toISOString() ?? null,
      bidsCount: auction._count.bids,
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const auction = await getCompanyAuctionForVehicle(auth.companyId, id);

  if (!auction || !auction.vehicle) {
    return NextResponse.json({ error: "VEHICLE_NOT_FOUND" }, { status: 404 });
  }

  if (!isDraftLikeState(auction.state)) {
    return NextResponse.json(
      {
        error: "VEHICLE_EDIT_LOCKED",
        message: "Vehicle can only be edited while linked auction is DRAFT",
      },
      { status: 409 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = updateVehicleSchema.safeParse(body);

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

  try {
    await prisma.vehicle.update({
      where: {
        id,
      },
      data: {
        brand: payload.brand,
        model: payload.model,
        year: payload.year,
        vin: payload.vin ? payload.vin.toUpperCase() : undefined,
        regionSpec: payload.regionSpec,
        bodyType: payload.bodyType,
        fuelType: payload.fuelType,
        transmission: payload.transmission,
        airbags: payload.airbags,
        mileage: payload.mileageKm,
        exteriorColor: payload.color,
        condition: payload.condition,
        serviceHistory: payload.serviceHistory,
        description: payload.description,
        damageMap: payload.damageMap,
      },
    });

    return NextResponse.json({ message: "Vehicle updated" });
  } catch (error) {
    const maybePrisma = error as { code?: string };

    if (maybePrisma.code === "P2002") {
      return NextResponse.json(
        {
          error: "VIN_ALREADY_EXISTS",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const { id } = await context.params;
  const auctions = await prisma.auction.findMany({
    where: {
      sellerCompanyId: auth.companyId,
      vehicleId: id,
    },
    select: {
      id: true,
      state: true,
    },
  });

  if (auctions.length === 0) {
    return NextResponse.json({ error: "VEHICLE_NOT_FOUND" }, { status: 404 });
  }

  const nonDraft = auctions.find((auction) => auction.state !== "DRAFT");

  if (nonDraft) {
    return NextResponse.json(
      {
        error: "VEHICLE_DELETE_BLOCKED",
        message: "Only vehicles linked to draft auctions can be deleted",
      },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicleMedia.deleteMany({
      where: {
        vehicleId: id,
      },
    });

    await tx.auction.deleteMany({
      where: {
        sellerCompanyId: auth.companyId,
        vehicleId: id,
      },
    });

    await tx.vehicle.delete({
      where: {
        id,
      },
    });
  });

  return NextResponse.json({ message: "Vehicle and draft auctions deleted" });
}

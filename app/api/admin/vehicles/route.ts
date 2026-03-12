export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import prisma from "@/src/infrastructure/database/prisma";

import { requireAdminSession } from "@/app/api/admin/_lib/admin_session";

type AdminVehicleStatus = "PENDING" | "APPROVED" | "REJECTED";

function resolveVehicleStatus(state: string | null): AdminVehicleStatus {
  if (!state || state === "DRAFT") {
    return "PENDING";
  }

  if (state === "CANCELED") {
    return "REJECTED";
  }

  return "APPROVED";
}

function toNumber(value: { toString(): string } | null): number {
  if (!value) {
    return 0;
  }

  return Number(value.toString());
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdminSession(request);

  if (session instanceof NextResponse) {
    return session;
  }

  const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() ?? "ALL";
  const onlyUnassigned = request.nextUrl.searchParams.get("unassigned") === "true";

  const vehicles = await prisma.vehicle.findMany({
    include: {
      media: {
        orderBy: {
          sortOrder: "asc",
        },
        take: 1,
        select: {
          url: true,
        },
      },
      auctions: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          state: true,
        },
      },
    },
    orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }],
  });

  const filtered = vehicles.filter((vehicle) => {
    const latestState = vehicle.auctions[0]?.state ?? null;
    const resolvedStatus = resolveVehicleStatus(latestState);

    if (status === "PENDING" && resolvedStatus !== "PENDING") {
      return false;
    }

    if (status === "APPROVED" && resolvedStatus !== "APPROVED") {
      return false;
    }

    if (status === "REJECTED" && resolvedStatus !== "REJECTED") {
      return false;
    }

    if (
      onlyUnassigned &&
      (latestState === "SCHEDULED" || latestState === "LIVE" || latestState === "EXTENDED")
    ) {
      return false;
    }

    return true;
  });

  return NextResponse.json({
    vehicles: filtered.map((vehicle) => ({
      id: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
      marketPriceAed: toNumber(vehicle.marketPrice),
      status: resolveVehicleStatus(vehicle.auctions[0]?.state ?? null),
      imageUrl: vehicle.media[0]?.url ?? vehicle.images[0] ?? null,
      label: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
    })),
  });
}

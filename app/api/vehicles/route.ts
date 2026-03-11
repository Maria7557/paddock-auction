export const runtime = "nodejs";

import { z } from "zod";

import prisma from "@/src/infrastructure/database/prisma";
import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";
import { getVehiclesHandler } from "@/src/modules/vehicles/transport/vehicle_handlers";

const createVehicleSchema = z
  .object({
    brand: z.string().trim().min(1),
    model: z.string().trim().min(1),
    year: z.coerce.number().int().min(1886),
    vin: z.string().trim().min(1).max(64),
    mileage: z.coerce.number().int().nonnegative().optional(),
    mileageKm: z.coerce.number().int().nonnegative().optional(),
    fuelType: z.string().trim().min(1).optional(),
    transmission: z.string().trim().min(1).optional(),
    bodyType: z.string().trim().min(1).optional(),
    regionSpec: z.string().trim().min(1).optional(),
    condition: z.string().trim().min(1).optional(),
    serviceHistory: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    engine: z.string().trim().optional(),
    driveType: z.string().trim().optional(),
    exteriorColor: z.string().trim().optional(),
    interiorColor: z.string().trim().optional(),
    airbags: z.string().trim().optional(),
    damage: z.string().trim().optional(),
    images: z.array(z.string()).optional(),
  })
  .superRefine((payload, context) => {
    if (payload.mileage === undefined && payload.mileageKm === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mileageKm"],
        message: "Either mileage or mileageKm is required",
      });
    }
  });

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

export const POST = withStructuredMutationLogging(async (request: Request): Promise<Response> => {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return json(400, {
      error_code: "VEHICLE_INVALID_PAYLOAD",
      message: "Request body must be valid JSON",
    });
  }

  const parsed = createVehicleSchema.safeParse(requestBody);

  if (!parsed.success) {
    return json(400, {
      error_code: "VEHICLE_INVALID_PAYLOAD",
      message: parsed.error.issues.map((issue) => issue.message).join("; "),
    });
  }

  const payload = parsed.data;

  try {
    const created = await prisma.vehicle.create({
      data: {
        brand: payload.brand,
        model: payload.model,
        year: payload.year,
        mileage: payload.mileageKm ?? payload.mileage ?? 0,
        vin: payload.vin.toUpperCase(),
        fuelType: payload.fuelType,
        transmission: payload.transmission,
        bodyType: payload.bodyType,
        regionSpec: payload.regionSpec,
        condition: payload.condition,
        serviceHistory: payload.serviceHistory,
        description: payload.description,
        engine: payload.engine,
        driveType: payload.driveType,
        exteriorColor: payload.exteriorColor,
        interiorColor: payload.interiorColor,
        airbags: payload.airbags,
        damage: payload.damage,
        images: payload.images,
      },
    });

    return json(201, {
      id: created.id,
      brand: created.brand,
      model: created.model,
      year: created.year,
      mileage: created.mileage,
      vin: created.vin,
    });
  } catch (error) {
    const maybePrisma = error as { code?: string };

    if (maybePrisma.code === "P2002") {
      return json(409, {
        error_code: "VEHICLE_VIN_ALREADY_EXISTS",
        message: `Vehicle with VIN ${payload.vin.toUpperCase()} already exists`,
      });
    }

    return json(500, {
      error_code: "VEHICLE_INTERNAL_ERROR",
      message: "Unexpected internal error",
    });
  }
});

export async function GET(): Promise<Response> {
  return getVehiclesHandler();
}

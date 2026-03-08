import { Prisma, type PrismaClient } from "@prisma/client";

import prisma from "../../../infrastructure/database/prisma";
import { DomainConflictError } from "../../../lib/domain_errors";
import type { CreateVehicleCommand, Vehicle, VehicleRepository } from "../application/vehicle_service";
import { vehicleErrorCodes } from "../domain/vehicle_error_codes";

type VehicleDbClient = Pick<PrismaClient, "vehicle">;

function isVehicleVinConflictError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.some((entry) => String(entry).toLowerCase().includes("vin"));
  }

  if (typeof target === "string") {
    return target.toLowerCase().includes("vin");
  }

  return false;
}

function mapVehicle(vehicle: {
  id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
}): Vehicle {
  return {
    id: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    mileage: vehicle.mileage,
    vin: vehicle.vin,
  };
}

export function createVehicleRepository(dbClient: VehicleDbClient = prisma): VehicleRepository {
  return {
    async createVehicle(input: CreateVehicleCommand): Promise<Vehicle> {
      try {
        const vehicle = await dbClient.vehicle.create({
          data: {
            brand: input.brand,
            model: input.model,
            year: input.year,
            mileage: input.mileage,
            vin: input.vin,
          },
        });

        return mapVehicle(vehicle);
      } catch (error) {
        if (isVehicleVinConflictError(error)) {
          throw new DomainConflictError(
            vehicleErrorCodes.vehicleVinAlreadyExists,
            `Vehicle with VIN ${input.vin} already exists`,
          );
        }

        throw error;
      }
    },

    async listVehicles(): Promise<Vehicle[]> {
      const vehicles = await dbClient.vehicle.findMany({
        orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }, { id: "asc" }],
      });

      return vehicles.map((vehicle) => mapVehicle(vehicle));
    },
  };
}

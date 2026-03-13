import { DomainConflictError } from "../../../lib/domain_errors";
import type { CreateVehicleCommand, Vehicle, VehicleRepository } from "../application/vehicle_service";
import { vehicleErrorCodes } from "../domain/vehicle_error_codes";

type VehicleRecord = {
  id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
  fuelType: string | null;
  transmission: string | null;
  bodyType: string | null;
  regionSpec: string | null;
  condition: string | null;
  serviceHistory: string | null;
};

type VehicleDbClient = {
  vehicle: {
    create(args: {
      data: {
        brand: string;
        model: string;
        year: number;
        mileage: number;
        vin: string;
        fuelType?: string;
        transmission?: string;
        bodyType?: string;
        regionSpec?: string;
        condition?: string;
        serviceHistory?: string;
      };
    }): Promise<VehicleRecord>;
    findMany(args: {
      orderBy: Array<Record<string, "asc" | "desc">>;
    }): Promise<VehicleRecord[]>;
  };
};

function isVehicleVinConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const target =
    "meta" in error && typeof error.meta === "object" && error.meta !== null && "target" in error.meta
      ? error.meta.target
      : null;

  if ((error as { code?: string }).code !== "P2002") {
    return false;
  }

  if (Array.isArray(target)) {
    return target.some((entry) => String(entry).toLowerCase().includes("vin"));
  }

  if (typeof target === "string") {
    return target.toLowerCase().includes("vin");
  }

  return false;
}

function mapVehicle(vehicle: VehicleRecord): Vehicle {
  return {
    id: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    mileage: vehicle.mileage,
    vin: vehicle.vin,
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    bodyType: vehicle.bodyType,
    regionSpec: vehicle.regionSpec,
    condition: vehicle.condition,
    serviceHistory: vehicle.serviceHistory,
  };
}

function requireDbClient(dbClient: VehicleDbClient | null): VehicleDbClient {
  if (!dbClient) {
    throw new Error("Vehicle persistence has been moved out of the Next.js frontend.");
  }

  return dbClient;
}

export function createVehicleRepository(dbClient: VehicleDbClient | null = null): VehicleRepository {
  return {
    async createVehicle(input: CreateVehicleCommand): Promise<Vehicle> {
      try {
        const vehicle = await requireDbClient(dbClient).vehicle.create({
          data: {
            brand: input.brand,
            model: input.model,
            year: input.year,
            mileage: input.mileage,
            vin: input.vin,
            fuelType: input.fuelType,
            transmission: input.transmission,
            bodyType: input.bodyType,
            regionSpec: input.regionSpec,
            condition: input.condition,
            serviceHistory: input.serviceHistory,
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
      const vehicles = await requireDbClient(dbClient).vehicle.findMany({
        orderBy: [{ brand: "asc" }, { model: "asc" }, { year: "desc" }, { id: "asc" }],
      });

      return vehicles.map((vehicle) => mapVehicle(vehicle));
    },
  };
}

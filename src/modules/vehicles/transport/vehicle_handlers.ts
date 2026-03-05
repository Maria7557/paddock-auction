import { DomainError } from "../../../lib/domain_errors";
import { createVehicleService, type VehicleService } from "../application/vehicle_service";
import { vehicleErrorCodes } from "../domain/vehicle_error_codes";
import { createVehicleRepository } from "../infrastructure/vehicle_prisma_repository";
import { z } from "zod";

const createVehiclePayloadSchema = z.object({
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.coerce.number().int().min(1886),
  mileage: z.coerce.number().int().nonnegative(),
  vin: z.string().trim().min(1).max(64),
});

type VehicleResponse = {
  id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
};

type VehicleResult = {
  status: number;
  body: Record<string, unknown>;
  errorCode?: string;
};

export type PostVehicleHandlerDependencies = {
  vehicleService: Pick<VehicleService, "createVehicle">;
};

export type GetVehiclesHandlerDependencies = {
  vehicleService: Pick<VehicleService, "listVehicles">;
};

function jsonResult(result: VehicleResult): Response {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (result.errorCode) {
    headers.set("x-error-code", result.errorCode);
  }

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers,
  });
}

function toVehicleResponse(vehicle: VehicleResponse): VehicleResponse {
  return {
    id: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    mileage: vehicle.mileage,
    vin: vehicle.vin,
  };
}

export function createPostVehicleHandler(
  dependencies: PostVehicleHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    try {
      let requestBody: unknown;

      try {
        requestBody = await request.json();
      } catch {
        return jsonResult({
          status: 400,
          errorCode: vehicleErrorCodes.invalidPayload,
          body: {
            error_code: vehicleErrorCodes.invalidPayload,
            message: "Request body must be valid JSON",
          },
        });
      }

      const parsedBody = createVehiclePayloadSchema.safeParse(requestBody);

      if (!parsedBody.success) {
        return jsonResult({
          status: 400,
          errorCode: vehicleErrorCodes.invalidPayload,
          body: {
            error_code: vehicleErrorCodes.invalidPayload,
            message: parsedBody.error.issues.map((issue) => issue.message).join("; "),
          },
        });
      }

      const payload = parsedBody.data;
      const vehicle = await dependencies.vehicleService.createVehicle({
        brand: payload.brand,
        model: payload.model,
        year: payload.year,
        mileage: payload.mileage,
        vin: payload.vin.toUpperCase(),
      });

      return jsonResult({
        status: 201,
        body: toVehicleResponse(vehicle),
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return jsonResult({
          status: error.status,
          errorCode: error.code,
          body: {
            error_code: error.code,
            message: error.message,
          },
        });
      }

      return jsonResult({
        status: 500,
        errorCode: vehicleErrorCodes.internalError,
        body: {
          error_code: vehicleErrorCodes.internalError,
          message: "Unexpected internal error",
        },
      });
    }
  };
}

export function createGetVehiclesHandler(
  dependencies: GetVehiclesHandlerDependencies,
): () => Promise<Response> {
  return async (): Promise<Response> => {
    try {
      const vehicles = await dependencies.vehicleService.listVehicles();

      return jsonResult({
        status: 200,
        body: {
          vehicles: vehicles.map((vehicle) => toVehicleResponse(vehicle)),
        },
      });
    } catch {
      return jsonResult({
        status: 500,
        errorCode: vehicleErrorCodes.internalError,
        body: {
          error_code: vehicleErrorCodes.internalError,
          message: "Unexpected internal error",
        },
      });
    }
  };
}

const defaultVehicleService = createVehicleService(createVehicleRepository());

export const postVehicleHandler = createPostVehicleHandler({
  vehicleService: defaultVehicleService,
});

export const getVehiclesHandler = createGetVehiclesHandler({
  vehicleService: defaultVehicleService,
});

import assert from "node:assert/strict";
import test from "node:test";

import { DomainConflictError } from "../../../lib/domain_errors";
import { vehicleErrorCodes } from "../domain/vehicle_error_codes";
import { createGetVehiclesHandler, createPostVehicleHandler } from "./vehicle_handlers";

async function parseResponse(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

test("createPostVehicleHandler creates vehicle and normalizes VIN", async () => {
  let receivedVin: string | null = null;
  const handler = createPostVehicleHandler({
    vehicleService: {
      createVehicle: async (command) => {
        receivedVin = command.vin;

        return {
          id: "veh-1",
          brand: command.brand,
          model: command.model,
          year: command.year,
          mileage: command.mileage,
          vin: command.vin,
        };
      },
    },
  });

  const response = await handler(
    new Request("https://example.com/api/vehicles", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        brand: "Porsche",
        model: "911 Turbo",
        year: 2024,
        mileage: 4500,
        vin: " wp0zz99zts3921247 ",
      }),
    }),
  );

  const parsed = await parseResponse(response);

  assert.equal(parsed.status, 201);
  assert.equal(receivedVin, "WP0ZZ99ZTS3921247");
  assert.equal(parsed.body.id, "veh-1");
  assert.equal(parsed.body.vin, "WP0ZZ99ZTS3921247");
});

test("createPostVehicleHandler rejects invalid payload", async () => {
  const handler = createPostVehicleHandler({
    vehicleService: {
      createVehicle: async () => {
        throw new Error("should not be called");
      },
    },
  });

  const response = await handler(
    new Request("https://example.com/api/vehicles", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        brand: "",
        model: "Model S",
        year: 2024,
        mileage: 10,
        vin: "VIN-001",
      }),
    }),
  );

  const parsed = await parseResponse(response);

  assert.equal(parsed.status, 400);
  assert.equal(response.headers.get("x-error-code"), vehicleErrorCodes.invalidPayload);
  assert.equal(parsed.body.error_code, vehicleErrorCodes.invalidPayload);
});

test("createPostVehicleHandler maps domain conflicts to 409", async () => {
  const handler = createPostVehicleHandler({
    vehicleService: {
      createVehicle: async () => {
        throw new DomainConflictError(
          vehicleErrorCodes.vehicleVinAlreadyExists,
          "Vehicle with VIN VIN-001 already exists",
        );
      },
    },
  });

  const response = await handler(
    new Request("https://example.com/api/vehicles", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        brand: "BMW",
        model: "M4",
        year: 2023,
        mileage: 12000,
        vin: "VIN-001",
      }),
    }),
  );

  const parsed = await parseResponse(response);

  assert.equal(parsed.status, 409);
  assert.equal(response.headers.get("x-error-code"), vehicleErrorCodes.vehicleVinAlreadyExists);
  assert.equal(parsed.body.error_code, vehicleErrorCodes.vehicleVinAlreadyExists);
});

test("createGetVehiclesHandler returns vehicles list", async () => {
  const handler = createGetVehiclesHandler({
    vehicleService: {
      listVehicles: async () => [
        {
          id: "veh-1",
          brand: "Ferrari",
          model: "SF90",
          year: 2025,
          mileage: 100,
          vin: "VIN-FERRARI",
        },
      ],
    },
  });

  const response = await handler();
  const parsed = await parseResponse(response);

  assert.equal(parsed.status, 200);
  assert.deepEqual(parsed.body, {
    vehicles: [
      {
        id: "veh-1",
        brand: "Ferrari",
        model: "SF90",
        year: 2025,
        mileage: 100,
        vin: "VIN-FERRARI",
      },
    ],
  });
});

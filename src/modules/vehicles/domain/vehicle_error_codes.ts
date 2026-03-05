export const vehicleErrorCodes = {
  invalidPayload: "INVALID_VEHICLE_PAYLOAD",
  vehicleVinAlreadyExists: "VEHICLE_VIN_ALREADY_EXISTS",
  internalError: "INTERNAL_ERROR",
} as const;

export type VehicleErrorCode = (typeof vehicleErrorCodes)[keyof typeof vehicleErrorCodes];

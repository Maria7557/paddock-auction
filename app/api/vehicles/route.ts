import { withStructuredMutationLogging } from "@/src/modules/platform/transport/structured_logging_middleware";
import { getVehiclesHandler, postVehicleHandler } from "@/src/modules/vehicles/transport/vehicle_handlers";

export const POST = withStructuredMutationLogging(async (request: Request) => {
  return postVehicleHandler(request);
});

export async function GET(): Promise<Response> {
  return getVehiclesHandler();
}

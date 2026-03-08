export type Vehicle = {
  id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
};

export type CreateVehicleCommand = Omit<Vehicle, "id">;

export type VehicleRepository = {
  createVehicle(input: CreateVehicleCommand): Promise<Vehicle>;
  listVehicles(): Promise<Vehicle[]>;
};

export type VehicleService = {
  createVehicle(command: CreateVehicleCommand): Promise<Vehicle>;
  listVehicles(): Promise<Vehicle[]>;
};

export function createVehicleService(repository: VehicleRepository): VehicleService {
  return {
    async createVehicle(command: CreateVehicleCommand): Promise<Vehicle> {
      return repository.createVehicle(command);
    },

    async listVehicles(): Promise<Vehicle[]> {
      return repository.listVehicles();
    },
  };
}

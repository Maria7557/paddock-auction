export type Vehicle = {
  id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
  fuelType?: string | null;
  transmission?: string | null;
  bodyType?: string | null;
  regionSpec?: string | null;
  condition?: string | null;
  serviceHistory?: string | null;
  sellerNotes?: string | null;
};

export type CreateVehicleCommand = {
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
  description?: string;
  color?: string;
  sellerNotes?: string;
};

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

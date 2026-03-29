import type { DamageMapValue } from "@/components/seller/DamageDiagram";

export type SellerVehicleFeatures = {
  comfortInterior: {
    heatedFrontSeats?: boolean;
    heatedRearSeats?: boolean;
    ventilatedSeats?: boolean;
    heatedSteeringWheel?: boolean;
    memorySeats?: boolean;
    powerSeats?: boolean;
    massageSeats?: boolean;
    sunroof?: boolean;
    panoramicRoof?: boolean;
    thirdRowSeats?: boolean;
    rearEntertainment?: boolean;
    ambientLighting?: boolean;
  };
  safety: {
    blindSpotMonitoring?: boolean;
    laneDepatureWarning?: boolean;
    frontParkingSensors?: boolean;
    rearParkingSensors?: boolean;
    rearCamera?: boolean;
    surroundCamera?: boolean;
    adaptiveCruiseControl?: boolean;
    automaticEmergencyBraking?: boolean;
    nightVision?: boolean;
    headUpDisplay?: boolean;
  };
  technology: {
    appleCarPlay?: boolean;
    androidAuto?: boolean;
    navigationSystem?: boolean;
    wirelessCharging?: boolean;
    premiumSound?: boolean;
    digitalInstrumentCluster?: boolean;
    otaUpdates?: boolean;
    wifiHotspot?: boolean;
  };
  exterior: {
    towHitch?: boolean;
    runningBoards?: boolean;
    roofRails?: boolean;
    sportExhaust?: boolean;
    wheels20plus?: boolean;
    wheels21plus?: boolean;
    spareTire?: boolean;
    selfClosingDoors?: boolean;
  };
  interiorMaterial: "" | "Leather" | "Fabric" | "Alcantara" | "Partial Leather";
  soundBrand: "" | "B&O" | "Bose" | "Harman Kardon" | "JBL" | "Burmester" | "Other";
};

export type SellerVehicleFormValues = {
  brand: string;
  model: string;
  year: string;
  vin: string;
  regionSpec: string;
  bodyType: string;
  fuelType: string;
  transmission: string;
  airbags: string;
  color: string;
  mileageKm: string;
  condition: string;
  serviceHistory: string;
  description: string;
  damageMap: DamageMapValue;
  photoUrls: string[];
  mulkiyaFrontUrl: string;
  mulkiyaBackUrl: string;
  buyNowPriceAed: string;
  inspectionDropoffDate: string;
};

export const EMPTY_VEHICLE_FORM: SellerVehicleFormValues = {
  brand: "",
  model: "",
  year: "",
  vin: "",
  regionSpec: "",
  bodyType: "",
  fuelType: "",
  transmission: "",
  airbags: "",
  color: "",
  mileageKm: "",
  condition: "",
  serviceHistory: "",
  description: "",
  damageMap: {},
  photoUrls: [],
  mulkiyaFrontUrl: "",
  mulkiyaBackUrl: "",
  buyNowPriceAed: "",
  inspectionDropoffDate: "",
};

export const EMPTY_VEHICLE_FEATURES: SellerVehicleFeatures = {
  comfortInterior: {},
  safety: {},
  technology: {},
  exterior: {},
  interiorMaterial: "",
  soundBrand: "",
};

type VehicleFormDraftState = {
  values: SellerVehicleFormValues;
  hasPendingPhotoUploads: boolean;
  hasPendingMulkiyaFrontUpload: boolean;
  hasPendingMulkiyaBackUpload: boolean;
};

function normalizeDamageMap(value: DamageMapValue): DamageMapValue {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  ) as DamageMapValue;
}

function normalizeVehicleFormValues(values: SellerVehicleFormValues): SellerVehicleFormValues {
  return {
    ...values,
    damageMap: normalizeDamageMap(values.damageMap),
    photoUrls: [...values.photoUrls],
  };
}

export function toVehicleFormValues(initialValues?: Partial<SellerVehicleFormValues>): SellerVehicleFormValues {
  return {
    ...EMPTY_VEHICLE_FORM,
    ...initialValues,
    damageMap: initialValues?.damageMap ? normalizeDamageMap(initialValues.damageMap) : {},
    photoUrls: initialValues?.photoUrls ? [...initialValues.photoUrls] : [],
  };
}

export function hasVehicleFormUnsavedChanges(
  initialValues: SellerVehicleFormValues,
  draftState: VehicleFormDraftState,
): boolean {
  if (
    draftState.hasPendingPhotoUploads ||
    draftState.hasPendingMulkiyaFrontUpload ||
    draftState.hasPendingMulkiyaBackUpload
  ) {
    return true;
  }

  return JSON.stringify(normalizeVehicleFormValues(initialValues)) !== JSON.stringify(normalizeVehicleFormValues(draftState.values));
}

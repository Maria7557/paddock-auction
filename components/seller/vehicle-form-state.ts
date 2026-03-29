import type { DamageMapValue } from "@/components/seller/DamageDiagram";

export type InteriorMaterialValue = "Leather" | "Fabric" | "Alcantara" | "Partial Leather" | "";
export type PremiumSoundBrandValue = "B&O" | "Bose" | "Harman Kardon" | "JBL" | "Burmester" | "Other" | "";

export type SellerVehicleComfortInteriorFeatures = {
  heatedFrontSeats: boolean;
  heatedRearSeats: boolean;
  ventilatedSeats: boolean;
  heatedSteeringWheel: boolean;
  memorySeats: boolean;
  powerSeats: boolean;
  massageSeats: boolean;
  sunroof: boolean;
  panoramicRoof: boolean;
  thirdRowSeats: boolean;
  rearEntertainment: boolean;
  ambientLighting: boolean;
};

export type SellerVehicleSafetyFeatures = {
  blindSpotMonitoring: boolean;
  laneDepatureWarning: boolean;
  frontParkingSensors: boolean;
  rearParkingSensors: boolean;
  rearCamera: boolean;
  surroundCamera: boolean;
  adaptiveCruiseControl: boolean;
  automaticEmergencyBraking: boolean;
  nightVision: boolean;
  headUpDisplay: boolean;
};

export type SellerVehicleTechnologyFeatures = {
  appleCarPlay: boolean;
  androidAuto: boolean;
  navigationSystem: boolean;
  wirelessCharging: boolean;
  premiumSound: boolean;
  digitalInstrumentCluster: boolean;
  otaUpdates: boolean;
  wifiHotspot: boolean;
};

export type SellerVehicleExteriorFeatures = {
  towHitch: boolean;
  runningBoards: boolean;
  roofRails: boolean;
  sportExhaust: boolean;
  wheels20plus: boolean;
  wheels21plus: boolean;
  spareTire: boolean;
  selfClosingDoors: boolean;
};

export type SellerVehicleFeatures = {
  comfortInterior: SellerVehicleComfortInteriorFeatures;
  interiorMaterial: InteriorMaterialValue;
  safety: SellerVehicleSafetyFeatures;
  technology: SellerVehicleTechnologyFeatures;
  soundBrand: PremiumSoundBrandValue;
  exterior: SellerVehicleExteriorFeatures;
};

type SellerVehicleFeaturesInput =
  | {
      comfortInterior?: Partial<SellerVehicleComfortInteriorFeatures>;
      interiorMaterial?: InteriorMaterialValue | null;
      safety?: Partial<SellerVehicleSafetyFeatures>;
      technology?: Partial<SellerVehicleTechnologyFeatures>;
      soundBrand?: PremiumSoundBrandValue | null;
      exterior?: Partial<SellerVehicleExteriorFeatures>;
    }
  | null
  | undefined;

export const EMPTY_VEHICLE_FEATURES: SellerVehicleFeatures = {
  comfortInterior: {
    heatedFrontSeats: false,
    heatedRearSeats: false,
    ventilatedSeats: false,
    heatedSteeringWheel: false,
    memorySeats: false,
    powerSeats: false,
    massageSeats: false,
    sunroof: false,
    panoramicRoof: false,
    thirdRowSeats: false,
    rearEntertainment: false,
    ambientLighting: false,
  },
  interiorMaterial: "",
  safety: {
    blindSpotMonitoring: false,
    laneDepatureWarning: false,
    frontParkingSensors: false,
    rearParkingSensors: false,
    rearCamera: false,
    surroundCamera: false,
    adaptiveCruiseControl: false,
    automaticEmergencyBraking: false,
    nightVision: false,
    headUpDisplay: false,
  },
  technology: {
    appleCarPlay: false,
    androidAuto: false,
    navigationSystem: false,
    wirelessCharging: false,
    premiumSound: false,
    digitalInstrumentCluster: false,
    otaUpdates: false,
    wifiHotspot: false,
  },
  soundBrand: "",
  exterior: {
    towHitch: false,
    runningBoards: false,
    roofRails: false,
    sportExhaust: false,
    wheels20plus: false,
    wheels21plus: false,
    spareTire: false,
    selfClosingDoors: false,
  },
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
  startCode: string;
  numberOfKeys: number;
  warrantyStatus: string;
  series: string;
  cylinders: number | null;
  manufacturedIn: string;
  features: SellerVehicleFeatures;
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
  startCode: "",
  numberOfKeys: 1,
  warrantyStatus: "None",
  series: "",
  cylinders: null,
  manufacturedIn: "",
  features: EMPTY_VEHICLE_FEATURES,
  description: "",
  damageMap: {},
  photoUrls: [],
  mulkiyaFrontUrl: "",
  mulkiyaBackUrl: "",
  buyNowPriceAed: "",
  inspectionDropoffDate: "",
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

function normalizeVehicleFeatures(input: SellerVehicleFeaturesInput): SellerVehicleFeatures {
  const comfortInterior = {
    ...EMPTY_VEHICLE_FEATURES.comfortInterior,
    ...(input?.comfortInterior ?? {}),
  };
  const safety = {
    ...EMPTY_VEHICLE_FEATURES.safety,
    ...(input?.safety ?? {}),
  };
  const technology = {
    ...EMPTY_VEHICLE_FEATURES.technology,
    ...(input?.technology ?? {}),
  };
  const exterior = {
    ...EMPTY_VEHICLE_FEATURES.exterior,
    ...(input?.exterior ?? {}),
  };

  return {
    comfortInterior,
    interiorMaterial: input?.interiorMaterial ?? EMPTY_VEHICLE_FEATURES.interiorMaterial,
    safety,
    technology,
    soundBrand: technology.premiumSound ? (input?.soundBrand ?? EMPTY_VEHICLE_FEATURES.soundBrand) : "",
    exterior,
  };
}

function normalizeVehicleFormValues(values: SellerVehicleFormValues): SellerVehicleFormValues {
  return {
    ...values,
    damageMap: normalizeDamageMap(values.damageMap),
    features: normalizeVehicleFeatures(values.features),
    photoUrls: [...values.photoUrls],
  };
}

export function toVehicleFormValues(initialValues?: Partial<SellerVehicleFormValues>): SellerVehicleFormValues {
  return {
    ...EMPTY_VEHICLE_FORM,
    ...initialValues,
    damageMap: initialValues?.damageMap ? normalizeDamageMap(initialValues.damageMap) : {},
    features: normalizeVehicleFeatures(initialValues?.features as SellerVehicleFeaturesInput),
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

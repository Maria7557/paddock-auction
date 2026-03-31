import {
  EMPTY_VEHICLE_FEATURES,
  type InteriorMaterialValue,
  type PremiumSoundBrandValue,
  type SellerVehicleFeatures,
} from "@/components/seller/vehicle-form-state";
import type { SupportedLocale } from "@/src/i18n/routing";

type FeatureSectionKey = "comfortInterior" | "safety" | "technology" | "exterior";

type FeatureOption = {
  key: string;
  label: string;
  aliases?: string[];
};

type FeatureGroup = {
  key: FeatureSectionKey;
  label: Record<SupportedLocale, string>;
  items: readonly FeatureOption[];
};

const LOT_FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    key: "comfortInterior",
    label: {
      en: "Comfort & interior",
      ru: "Комфорт и салон",
    },
    items: [
      { key: "heatedFrontSeats", label: "Heated front seats" },
      { key: "heatedRearSeats", label: "Heated rear seats" },
      { key: "ventilatedSeats", label: "Ventilated seats" },
      { key: "heatedSteeringWheel", label: "Heated steering wheel" },
      { key: "memorySeats", label: "Memory seats" },
      { key: "powerSeats", label: "Power seats" },
      { key: "massageSeats", label: "Massage seats" },
      { key: "sunroof", label: "Sunroof" },
      { key: "panoramicRoof", label: "Panoramic roof" },
      { key: "thirdRowSeats", label: "Third-row seats" },
      { key: "rearEntertainment", label: "Rear entertainment" },
      { key: "ambientLighting", label: "Ambient lighting" },
    ],
  },
  {
    key: "safety",
    label: {
      en: "Safety",
      ru: "Безопасность",
    },
    items: [
      { key: "blindSpotMonitoring", label: "Blind spot monitoring", aliases: ["Blind Spot Monitor"] },
      { key: "laneDepatureWarning", label: "Lane departure warning", aliases: ["Lane Assist"] },
      { key: "frontParkingSensors", label: "Front parking sensors", aliases: ["Parking Sensors"] },
      { key: "rearParkingSensors", label: "Rear parking sensors", aliases: ["Parking Sensors"] },
      { key: "rearCamera", label: "Rear camera", aliases: ["Reverse Camera"] },
      { key: "surroundCamera", label: "Surround camera", aliases: ["360 Camera"] },
      { key: "adaptiveCruiseControl", label: "Adaptive cruise control", aliases: ["Adaptive Cruise Control"] },
      { key: "automaticEmergencyBraking", label: "Automatic emergency braking" },
      { key: "nightVision", label: "Night vision" },
      { key: "headUpDisplay", label: "Head-up display" },
    ],
  },
  {
    key: "technology",
    label: {
      en: "Technology",
      ru: "Технологии",
    },
    items: [
      { key: "appleCarPlay", label: "Apple CarPlay" },
      { key: "androidAuto", label: "Android Auto" },
      { key: "navigationSystem", label: "Navigation system", aliases: ["Navigation"] },
      { key: "wirelessCharging", label: "Wireless charging" },
      { key: "premiumSound", label: "Premium sound" },
      { key: "digitalInstrumentCluster", label: "Digital instrument cluster", aliases: ["Digital Displays"] },
      { key: "otaUpdates", label: "OTA updates" },
      { key: "wifiHotspot", label: "Wi-Fi hotspot" },
    ],
  },
  {
    key: "exterior",
    label: {
      en: "Exterior",
      ru: "Экстерьер",
    },
    items: [
      { key: "towHitch", label: "Tow hitch" },
      { key: "runningBoards", label: "Running boards" },
      { key: "roofRails", label: "Roof rails" },
      { key: "sportExhaust", label: "Sport exhaust" },
      { key: "wheels20plus", label: "20-inch+ wheels", aliases: ["Alloy Wheels"] },
      { key: "wheels21plus", label: "21-inch+ wheels" },
      { key: "spareTire", label: "Spare tire" },
      { key: "selfClosingDoors", label: "Self-closing doors" },
    ],
  },
];
const INTERIOR_MATERIAL_VALUES: readonly InteriorMaterialValue[] = ["", "Leather", "Fabric", "Alcantara", "Partial Leather"];
const SOUND_BRAND_VALUES: readonly PremiumSoundBrandValue[] = ["", "B&O", "Bose", "Harman Kardon", "JBL", "Burmester", "Other"];

type LotFeatureDisplayGroup = {
  label: string;
  items: Array<{
    label: string;
    present: boolean;
  }>;
};

function normalizeFeatureString(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cloneEmptyFeatures(): SellerVehicleFeatures {
  return {
    comfortInterior: { ...EMPTY_VEHICLE_FEATURES.comfortInterior },
    interiorMaterial: EMPTY_VEHICLE_FEATURES.interiorMaterial,
    safety: { ...EMPTY_VEHICLE_FEATURES.safety },
    technology: { ...EMPTY_VEHICLE_FEATURES.technology },
    soundBrand: EMPTY_VEHICLE_FEATURES.soundBrand,
    exterior: { ...EMPTY_VEHICLE_FEATURES.exterior },
  };
}

function asInteriorMaterial(value: unknown): InteriorMaterialValue {
  return typeof value === "string" && INTERIOR_MATERIAL_VALUES.includes(value as InteriorMaterialValue)
    ? (value as InteriorMaterialValue)
    : "";
}

function asSoundBrand(value: unknown): PremiumSoundBrandValue {
  return typeof value === "string" && SOUND_BRAND_VALUES.includes(value as PremiumSoundBrandValue)
    ? (value as PremiumSoundBrandValue)
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const FEATURE_LOOKUP = LOT_FEATURE_GROUPS.reduce<Map<string, { section: FeatureSectionKey; key: string }>>((map, group) => {
  group.items.forEach((item) => {
    map.set(normalizeFeatureString(item.label), {
      section: group.key,
      key: item.key,
    });

    item.aliases?.forEach((alias) => {
      map.set(normalizeFeatureString(alias), {
        section: group.key,
        key: item.key,
      });
    });
  });

  return map;
}, new Map());

export function normalizeLotFeatures(value: unknown): SellerVehicleFeatures {
  const next = cloneEmptyFeatures();

  if (Array.isArray(value)) {
    value
      .filter((item): item is string => typeof item === "string")
      .forEach((item) => {
        const match = FEATURE_LOOKUP.get(normalizeFeatureString(item));

        if (!match) {
          return;
        }

        if (match.section === "comfortInterior") {
          next.comfortInterior[match.key as keyof SellerVehicleFeatures["comfortInterior"]] = true;
        } else if (match.section === "safety") {
          next.safety[match.key as keyof SellerVehicleFeatures["safety"]] = true;
        } else if (match.section === "technology") {
          next.technology[match.key as keyof SellerVehicleFeatures["technology"]] = true;
        } else {
          next.exterior[match.key as keyof SellerVehicleFeatures["exterior"]] = true;
        }
      });

    return next;
  }

  if (!isRecord(value)) {
    return next;
  }

  const comfortInterior = isRecord(value.comfortInterior) ? value.comfortInterior : null;
  const safety = isRecord(value.safety) ? value.safety : null;
  const technology = isRecord(value.technology) ? value.technology : null;
  const exterior = isRecord(value.exterior) ? value.exterior : null;

  LOT_FEATURE_GROUPS.forEach((group) => {
    group.items.forEach((item) => {
      const nestedValue =
        group.key === "comfortInterior"
          ? comfortInterior?.[item.key]
          : group.key === "safety"
            ? safety?.[item.key]
            : group.key === "technology"
              ? technology?.[item.key]
              : exterior?.[item.key];
      const flatValue = value[item.key];
      const isEnabled = nestedValue === true || flatValue === true;

      if (group.key === "comfortInterior") {
        next.comfortInterior[item.key as keyof SellerVehicleFeatures["comfortInterior"]] = isEnabled;
      } else if (group.key === "safety") {
        next.safety[item.key as keyof SellerVehicleFeatures["safety"]] = isEnabled;
      } else if (group.key === "technology") {
        next.technology[item.key as keyof SellerVehicleFeatures["technology"]] = isEnabled;
      } else {
        next.exterior[item.key as keyof SellerVehicleFeatures["exterior"]] = isEnabled;
      }
    });
  });

  next.interiorMaterial = asInteriorMaterial(typeof value.interiorMaterial === "string" ? value.interiorMaterial.trim() : "");
  next.soundBrand = asSoundBrand(typeof value.soundBrand === "string" ? value.soundBrand.trim() : "");

  if (!next.technology.premiumSound) {
    next.soundBrand = "";
  }

  return next;
}

export function getLotFeatureDisplayGroups(
  features: SellerVehicleFeatures,
  locale: SupportedLocale,
): LotFeatureDisplayGroup[] {
  return LOT_FEATURE_GROUPS.map((group) => ({
    label: group.label[locale],
    items: group.items.map((item) => {
      const present =
        group.key === "comfortInterior"
          ? features.comfortInterior[item.key as keyof SellerVehicleFeatures["comfortInterior"]]
          : group.key === "safety"
            ? features.safety[item.key as keyof SellerVehicleFeatures["safety"]]
            : group.key === "technology"
              ? features.technology[item.key as keyof SellerVehicleFeatures["technology"]]
              : features.exterior[item.key as keyof SellerVehicleFeatures["exterior"]];

      return {
        label: item.label,
        present,
      };
    }),
  }));
}

"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { getAdminCopy } from "@/app/admin/i18n";
import { DamageDiagram, type DamageMapValue } from "@/components/seller/DamageDiagram";
import { EMPTY_VEHICLE_FEATURES, type SellerVehicleFeatures } from "@/components/seller/vehicle-form-state";
import { IconCar, IconShield, IconTag, IconZap } from "@/components/ui/icons";
import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { toIntlLocale, type SupportedLocale } from "@/src/i18n/routing";
import {
  BODY_TYPES,
  COLORS,
  FUEL_TYPES,
  REGION_SPECS,
  SERVICE_HISTORY_OPTIONS,
  TRANSMISSION_TYPES,
  UAE_BRANDS,
} from "@/src/lib/vehicle_data";
import { formatAed } from "@/src/lib/utils";

import styles from "./AdminDetailModal.module.css";

type DetailEntity =
  | {
      kind: "company";
      id: string;
      label: string;
    }
  | {
      kind: "buyer";
      id: string;
      label: string;
    }
  | {
      kind: "vehicle";
      id: string;
      label: string;
    };

type CompanyDetailResponse = {
  company: {
    id: string;
    name: string;
    country: string;
    phone: string | null;
    registrationNumber: string;
    status: string;
    createdAt: string;
    members: Array<{
      id: string;
      email: string;
      role: string;
      accountRole: string;
      status: string;
      city: string | null;
      createdAt: string;
      kycVerified: boolean;
    }>;
    recentVehicles: Array<{
      auctionId: string;
      vehicleId: string;
      label: string;
      status: string;
      startsAt: string;
      endsAt: string;
      startingPriceAed: number;
      buyNowPriceAed: number | null;
    }>;
  };
};

type UserDetailResponse = {
  user: {
    id: string;
    email: string;
    role: string;
    status: string;
    kycVerified: boolean;
    city: string | null;
    createdAt: string;
    walletBalanceAed: number;
    depositStatus: string;
    linkedCompanies: Array<{
      id: string;
      name: string;
      country: string;
      phone: string | null;
      registrationNumber: string;
      status: string;
      createdAt: string;
      membershipRole: string;
    }>;
  };
};

type VehicleDetailResponse = {
  vehicle: {
    id: string;
    label: string;
    brand: string;
    model: string;
    year: number;
    series: string | null;
    mileage: number;
    vin: string;
    status: string;
    photoUrls: string[];
    mulkiyaFrontUrl: string | null;
    mulkiyaBackUrl: string | null;
    fuelType: string | null;
    transmission: string | null;
    bodyType: string | null;
    regionSpec: string | null;
    serviceHistory: string | null;
    description: string | null;
    internalNotes: string | null;
    engine: string | null;
    driveType: string | null;
    exteriorColor: string | null;
    interiorColor: string | null;
    manufacturedIn: string | null;
    airbags: string | null;
    damage: string | null;
    damageMap: unknown;
    features: SellerVehicleFeatures | null;
    startCode: string | null;
    numberOfKeys: number | null;
    warrantyStatus: string | null;
    cylinders: number | null;
    conditionGrade: string | null;
    estimatedValueAed: number | null;
    titleStatus: string | null;
    primaryDamage: string | null;
    lossType: string | null;
    tireCondition: number | null;
    company: {
      id: string;
      name: string;
      status: string;
    } | null;
    latestAuction: {
      id: string;
      state: string;
      startsAt: string;
      endsAt: string;
      inspectionDropoffDate: string | null;
      viewingEndsAt: string | null;
      auctionStartsAt: string | null;
      auctionEndsAt: string | null;
      approvalStatusLabel?: string | null;
      currentPriceAed: number;
      startingPriceAed: number;
      buyNowPriceAed: number | null;
      minIncrementAed: number;
    } | null;
    assignedEvent: {
      id: string;
      title: string;
      status: string;
      startsAt: string;
    } | null;
  };
};

type DetailPayload = CompanyDetailResponse | UserDetailResponse | VehicleDetailResponse | null;

type FeedbackState =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

type VehicleEditState = {
  photoUrls: string[];
  mulkiyaFrontUrl: string;
  mulkiyaBackUrl: string;
  brand: string;
  model: string;
  year: string;
  series: string;
  vin: string;
  mileage: string;
  cylinders: string;
  engine: string;
  driveType: string;
  fuelType: string;
  transmission: string;
  bodyType: string;
  regionSpec: string;
  exteriorColor: string;
  interiorColor: string;
  manufacturedIn: string;
  numberOfKeys: string;
  warrantyStatus: string;
  startCode: string;
  airbags: string;
  serviceHistory: string;
  description: string;
  damage: string;
  damageMap: DamageMapValue;
  conditionGrade: string;
  estimatedValueAed: string;
  titleStatus: string;
  primaryDamage: string;
  lossType: string;
  tireCondition: string;
  internalNotes: string;
  features: SellerVehicleFeatures;
};

type EditableFieldProps = {
  label: string;
  children: ReactNode;
  full?: boolean;
};

type SectionProps = {
  title: string;
  children: ReactNode;
  tone?: "default" | "subtle";
};

type UploadMediaResponse = {
  photos?: string[];
  mulkiyaFrontUrl?: string | null;
  mulkiyaBackUrl?: string | null;
  error?: string;
  message?: string;
};

const START_CODE_OPTIONS = ["Run and Drive", "Stationary", "Does Not Start"] as const;
const NUMBER_OF_KEYS_OPTIONS = ["0", "1", "2", "3"] as const;
const WARRANTY_STATUS_OPTIONS = ["", "Active", "Expired", "None"] as const;
const CONDITION_GRADE_OPTIONS = ["", "A", "A+", "A++", "B", "B+", "C", "C+", "D", "D+"] as const;
const TITLE_STATUS_OPTIONS = ["", "Clean", "Salvage", "Flood", "Fire"] as const;
const PRIMARY_DAMAGE_OPTIONS = ["", "None", "Front End", "Rear End", "Side", "Roof", "Undercarriage", "All Over"] as const;
const LOSS_TYPE_OPTIONS = ["", "None", "Collision", "Flood", "Fire", "Theft", "Other"] as const;
const CYLINDER_OPTIONS = ["", "3", "4", "5", "6", "8", "10", "12"] as const;
const DRIVE_TYPE_OPTIONS = ["", "FWD", "RWD", "AWD", "4WD"] as const;
const AIRBAG_OPTIONS = [
  { value: "", label: "Select airbags" },
  { value: "NO_AIRBAGS", label: "No airbags" },
  { value: "2", label: "2 — Driver + Passenger" },
  { value: "4", label: "4 — Front + Side" },
  { value: "6", label: "6 — Front, Side + Curtain" },
  { value: "8", label: "8 — Full set" },
  { value: "10_PLUS", label: "10+ — Full + Knee airbags" },
  { value: "UNKNOWN", label: "Unknown" },
] as const;
const INTERIOR_MATERIAL_OPTIONS = ["Leather", "Fabric", "Alcantara", "Partial Leather"] as const;
const SOUND_BRAND_OPTIONS = ["", "B&O", "Bose", "Harman Kardon", "JBL", "Burmester", "Other"] as const;
const MANUFACTURED_IN_OPTIONS = [
  "Japan",
  "Germany",
  "United States",
  "South Korea",
  "United Kingdom",
  "China",
  "Italy",
  "Slovakia",
  "Mexico",
  "India",
  "Thailand",
  "Czech Republic",
  "Hungary",
  "Spain",
  "South Africa",
  "Canada",
] as const;
const DAMAGE_SUMMARY_OPTIONS = [
  "No visible damage",
  "Minor cosmetic wear",
  "Front-end damage",
  "Rear-end damage",
  "Side damage",
  "Multi-panel damage",
  "Roof damage",
  "Undercarriage damage",
] as const;
const SERIES_OPTIONS = [
  "Base",
  "Standard",
  "S",
  "SE",
  "SEL",
  "LE",
  "XLE",
  "EX",
  "EX-L",
  "GT",
  "Sport",
  "Luxury",
  "Premium",
  "Premium Plus",
  "Platinum",
  "Prestige",
  "Competition",
  "M Sport",
  "AMG Line",
] as const;
type FeatureSectionKey = "comfortInterior" | "safety" | "technology" | "exterior";
type FeatureSectionGroup = Pick<SellerVehicleFeatures, FeatureSectionKey>;
type FeatureOption<K extends FeatureSectionKey> = {
  key: keyof FeatureSectionGroup[K];
  label: string;
};

const DAMAGE_ZONE_LABELS: Record<string, string> = {
  front_bumper: "Front Bumper",
  hood: "Hood",
  fender_fl: "Front Left Fender",
  fender_fr: "Front Right Fender",
  door_fl: "Front Left Door",
  door_fr: "Front Right Door",
  roof: "Roof",
  door_rl: "Rear Left Door",
  door_rr: "Rear Right Door",
  trunk_area: "Trunk Area",
  quarter_rl: "Rear Left Quarter Panel",
  quarter_rr: "Rear Right Quarter Panel",
  trunk: "Trunk Lid",
  rear_bumper: "Rear Bumper",
  underbody: "Underbody",
};

const COMFORT_FEATURE_LABELS: Record<keyof SellerVehicleFeatures["comfortInterior"], string> = {
  heatedFrontSeats: "Heated front seats",
  heatedRearSeats: "Heated rear seats",
  ventilatedSeats: "Ventilated seats",
  heatedSteeringWheel: "Heated steering wheel",
  memorySeats: "Memory seats",
  powerSeats: "Power seats",
  massageSeats: "Massage seats",
  sunroof: "Sunroof",
  panoramicRoof: "Panoramic roof",
  thirdRowSeats: "Third-row seats",
  rearEntertainment: "Rear entertainment",
  ambientLighting: "Ambient lighting",
};

const SAFETY_FEATURE_LABELS: Record<keyof SellerVehicleFeatures["safety"], string> = {
  blindSpotMonitoring: "Blind spot monitoring",
  laneDepatureWarning: "Lane departure warning",
  frontParkingSensors: "Front parking sensors",
  rearParkingSensors: "Rear parking sensors",
  rearCamera: "Rear camera",
  surroundCamera: "Surround camera",
  adaptiveCruiseControl: "Adaptive cruise control",
  automaticEmergencyBraking: "Automatic emergency braking",
  nightVision: "Night vision",
  headUpDisplay: "Head-up display",
};

const TECHNOLOGY_FEATURE_LABELS: Record<keyof SellerVehicleFeatures["technology"], string> = {
  appleCarPlay: "Apple CarPlay",
  androidAuto: "Android Auto",
  navigationSystem: "Navigation system",
  wirelessCharging: "Wireless charging",
  premiumSound: "Premium sound",
  digitalInstrumentCluster: "Digital instrument cluster",
  otaUpdates: "OTA updates",
  wifiHotspot: "Wi-Fi hotspot",
};

const EXTERIOR_FEATURE_LABELS: Record<keyof SellerVehicleFeatures["exterior"], string> = {
  towHitch: "Tow hitch",
  runningBoards: "Running boards",
  roofRails: "Roof rails",
  sportExhaust: "Sport exhaust",
  wheels20plus: "20-inch+ wheels",
  wheels21plus: "21-inch+ wheels",
  spareTire: "Spare tire",
  selfClosingDoors: "Self-closing doors",
};

const COMFORT_INTERIOR_OPTIONS = [
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
] as const satisfies ReadonlyArray<FeatureOption<"comfortInterior">>;

const SAFETY_OPTIONS = [
  { key: "blindSpotMonitoring", label: "Blind spot monitoring" },
  { key: "laneDepatureWarning", label: "Lane departure warning" },
  { key: "frontParkingSensors", label: "Front parking sensors" },
  { key: "rearParkingSensors", label: "Rear parking sensors" },
  { key: "rearCamera", label: "Rear camera" },
  { key: "surroundCamera", label: "Surround camera" },
  { key: "adaptiveCruiseControl", label: "Adaptive cruise control" },
  { key: "automaticEmergencyBraking", label: "Automatic emergency braking" },
  { key: "nightVision", label: "Night vision" },
  { key: "headUpDisplay", label: "Head-up display" },
] as const satisfies ReadonlyArray<FeatureOption<"safety">>;

const TECHNOLOGY_OPTIONS = [
  { key: "appleCarPlay", label: "Apple CarPlay" },
  { key: "androidAuto", label: "Android Auto" },
  { key: "navigationSystem", label: "Navigation system" },
  { key: "wirelessCharging", label: "Wireless charging" },
  { key: "premiumSound", label: "Premium sound" },
  { key: "digitalInstrumentCluster", label: "Digital instrument cluster" },
  { key: "otaUpdates", label: "OTA updates" },
  { key: "wifiHotspot", label: "Wi-Fi hotspot" },
] as const satisfies ReadonlyArray<FeatureOption<"technology">>;

const EXTERIOR_OPTIONS = [
  { key: "towHitch", label: "Tow hitch" },
  { key: "runningBoards", label: "Running boards" },
  { key: "roofRails", label: "Roof rails" },
  { key: "sportExhaust", label: "Sport exhaust" },
  { key: "wheels20plus", label: "20-inch+ wheels" },
  { key: "wheels21plus", label: "21-inch+ wheels" },
  { key: "spareTire", label: "Spare tire" },
  { key: "selfClosingDoors", label: "Self-closing doors" },
] as const satisfies ReadonlyArray<FeatureOption<"exterior">>;

function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toBrandLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function findUaeBrandKey(input: string): string | null {
  const normalized = cleanLabel(input).toLowerCase();

  if (!normalized) {
    return null;
  }

  for (const brandKey of Object.keys(UAE_BRANDS)) {
    const asLabel = toBrandLabel(brandKey).toLowerCase();

    if (brandKey.toLowerCase() === normalized || asLabel === normalized) {
      return brandKey;
    }
  }

  return null;
}

function withCurrentOption(options: readonly string[], currentValue: string): string[] {
  const normalizedCurrentValue = cleanLabel(currentValue);

  if (!normalizedCurrentValue) {
    return [...options];
  }

  return options.includes(normalizedCurrentValue) ? [...options] : [normalizedCurrentValue, ...options];
}

function isPdfUrl(url: string | null | undefined): boolean {
  return Boolean(url?.trim().toLowerCase().includes(".pdf"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDamageMap(value: unknown): DamageMapValue {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, "MINOR" | "MAJOR"] => entry[1] === "MINOR" || entry[1] === "MAJOR"),
  );
}

function readVehicleFeatures(value: unknown): SellerVehicleFeatures {
  if (!isRecord(value)) {
    return EMPTY_VEHICLE_FEATURES;
  }

  const comfortInterior = isRecord(value.comfortInterior) ? value.comfortInterior : {};
  const safety = isRecord(value.safety) ? value.safety : {};
  const technology = isRecord(value.technology) ? value.technology : {};
  const exterior = isRecord(value.exterior) ? value.exterior : {};

  const normalizedTechnology = {
    ...EMPTY_VEHICLE_FEATURES.technology,
    ...Object.fromEntries(
      Object.keys(EMPTY_VEHICLE_FEATURES.technology).map((key) => [key, technology[key] === true]),
    ),
  };

  return {
    comfortInterior: {
      ...EMPTY_VEHICLE_FEATURES.comfortInterior,
      ...Object.fromEntries(
        Object.keys(EMPTY_VEHICLE_FEATURES.comfortInterior).map((key) => [key, comfortInterior[key] === true]),
      ),
    },
    interiorMaterial:
      value.interiorMaterial === "Leather" ||
      value.interiorMaterial === "Fabric" ||
      value.interiorMaterial === "Alcantara" ||
      value.interiorMaterial === "Partial Leather"
        ? value.interiorMaterial
        : "",
    safety: {
      ...EMPTY_VEHICLE_FEATURES.safety,
      ...Object.fromEntries(
        Object.keys(EMPTY_VEHICLE_FEATURES.safety).map((key) => [key, safety[key] === true]),
      ),
    },
    technology: normalizedTechnology,
    soundBrand:
      normalizedTechnology.premiumSound &&
      (value.soundBrand === "B&O" ||
        value.soundBrand === "Bose" ||
        value.soundBrand === "Harman Kardon" ||
        value.soundBrand === "JBL" ||
        value.soundBrand === "Burmester" ||
        value.soundBrand === "Other")
        ? value.soundBrand
        : "",
    exterior: {
      ...EMPTY_VEHICLE_FEATURES.exterior,
      ...Object.fromEntries(
        Object.keys(EMPTY_VEHICLE_FEATURES.exterior).map((key) => [key, exterior[key] === true]),
      ),
    },
  };
}

function formatStatusLabel(value: string, locale: SupportedLocale): string {
  const t = getAdminCopy(locale);

  switch (value) {
    case "PENDING":
    case "PENDING_APPROVAL":
      return t.status.pending;
    case "APPROVED":
    case "ACTIVE":
      return t.status.approved;
    case "REJECTED":
      return t.status.rejected;
    case "BLOCKED":
      return t.status.blocked;
    case "NONE":
      return t.status.none;
    case "DRAFT":
      return t.status.draft;
    case "SCHEDULED":
      return t.status.scheduled;
    case "LIVE":
    case "EXTENDED":
      return t.status.live;
    case "ENDED":
    case "CLOSED":
    case "CANCELED":
    case "PAID":
    case "PAYMENT_PENDING":
    case "DEFAULTED":
    case "RELISTED":
      return t.status.ended;
    default:
      return value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function formatDateTime(value: string | null | undefined, locale: SupportedLocale): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatDateOnly(value: string | null | undefined, locale: SupportedLocale): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString("en-US");
}

function readDamageItems(value: unknown): Array<{ label: string; level: string }> {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .filter((entry): entry is [string, "MINOR" | "MAJOR"] => entry[1] === "MINOR" || entry[1] === "MAJOR")
    .sort(([left], [right]) => (DAMAGE_ZONE_LABELS[left] ?? left).localeCompare(DAMAGE_ZONE_LABELS[right] ?? right))
    .map(([zoneId, level]) => ({
      label: DAMAGE_ZONE_LABELS[zoneId] ?? zoneId,
      level: level === "MINOR" ? "Minor" : "Major",
    }));
}

function buildDamageSummary(vehicle: VehicleDetailResponse["vehicle"]): string {
  const normalizedDamage = cleanLabel(vehicle.damage ?? "");

  if (normalizedDamage && normalizedDamage.toLowerCase() !== "none") {
    return normalizedDamage;
  }

  if (vehicle.primaryDamage && vehicle.primaryDamage !== "None") {
    return vehicle.primaryDamage;
  }

  const damageItems = readDamageItems(vehicle.damageMap);

  if (damageItems.length === 0) {
    return "";
  }

  if (damageItems.length === 1) {
    return damageItems[0]?.label ?? "";
  }

  return `${damageItems[0]?.label ?? "Damage reported"} +${damageItems.length - 1} more`;
}

function toVehicleEditState(vehicle: VehicleDetailResponse["vehicle"]): VehicleEditState {
  return {
    photoUrls: [...vehicle.photoUrls],
    mulkiyaFrontUrl: vehicle.mulkiyaFrontUrl ?? "",
    mulkiyaBackUrl: vehicle.mulkiyaBackUrl ?? "",
    brand: vehicle.brand,
    model: vehicle.model,
    year: String(vehicle.year),
    series: vehicle.series ?? "",
    vin: vehicle.vin,
    mileage: String(vehicle.mileage),
    cylinders: vehicle.cylinders == null ? "" : String(vehicle.cylinders),
    engine: vehicle.engine ?? "",
    driveType: vehicle.driveType ?? "",
    fuelType: vehicle.fuelType ?? "",
    transmission: vehicle.transmission ?? "",
    bodyType: vehicle.bodyType ?? "",
    regionSpec: vehicle.regionSpec ?? "",
    exteriorColor: vehicle.exteriorColor ?? "",
    interiorColor: vehicle.interiorColor ?? "",
    manufacturedIn: vehicle.manufacturedIn ?? "",
    numberOfKeys: vehicle.numberOfKeys == null ? "1" : String(vehicle.numberOfKeys),
    warrantyStatus: vehicle.warrantyStatus ?? "",
    startCode: vehicle.startCode ?? "",
    airbags: vehicle.airbags ?? "",
    serviceHistory: vehicle.serviceHistory ?? "",
    description: vehicle.description ?? "",
    damage: buildDamageSummary(vehicle),
    damageMap: readDamageMap(vehicle.damageMap),
    conditionGrade: vehicle.conditionGrade ?? "",
    estimatedValueAed: vehicle.estimatedValueAed == null ? "" : String(vehicle.estimatedValueAed),
    titleStatus: vehicle.titleStatus ?? "",
    primaryDamage: vehicle.primaryDamage ?? "",
    lossType: vehicle.lossType ?? "",
    tireCondition: vehicle.tireCondition == null ? "" : String(vehicle.tireCondition),
    internalNotes: vehicle.internalNotes ?? "",
    features: readVehicleFeatures(vehicle.features),
  };
}

function toOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toVehicleUpdatePayload(draft: VehicleEditState): Record<string, unknown> {
  return {
    photoUrls: draft.photoUrls.map((url) => url.trim()).filter((url) => url.length > 0),
    mulkiyaFrontUrl: draft.mulkiyaFrontUrl.trim() || null,
    mulkiyaBackUrl: draft.mulkiyaBackUrl.trim() || null,
    brand: draft.brand.trim(),
    model: draft.model.trim(),
    year: Number(draft.year),
    series: draft.series.trim() || null,
    vin: draft.vin.trim().toUpperCase(),
    mileage: Number(draft.mileage),
    cylinders: toOptionalNumber(draft.cylinders),
    engine: draft.engine.trim() || null,
    driveType: draft.driveType.trim() || null,
    fuelType: draft.fuelType.trim() || null,
    transmission: draft.transmission.trim() || null,
    bodyType: draft.bodyType.trim() || null,
    regionSpec: draft.regionSpec.trim() || null,
    exteriorColor: draft.exteriorColor.trim() || null,
    interiorColor: draft.interiorColor.trim() || null,
    manufacturedIn: draft.manufacturedIn.trim() || null,
    numberOfKeys: draft.numberOfKeys ? Number(draft.numberOfKeys) : null,
    warrantyStatus: draft.warrantyStatus || null,
    startCode: draft.startCode || null,
    airbags: draft.airbags.trim() || null,
    serviceHistory: draft.serviceHistory.trim() || null,
    description: draft.description.trim() || null,
    damage: draft.damage.trim() || null,
    damageMap: draft.damageMap,
    conditionGrade: draft.conditionGrade || null,
    estimatedValueAed: toOptionalNumber(draft.estimatedValueAed),
    titleStatus: draft.titleStatus || null,
    primaryDamage: draft.primaryDamage || null,
    lossType: draft.lossType || null,
    tireCondition: toOptionalNumber(draft.tireCondition),
    internalNotes: draft.internalNotes.trim() || null,
    features: draft.features,
  };
}

function collectFeatureLabels(source: Record<string, boolean>, labels: Record<string, string>): string[] {
  return Object.entries(source)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => labels[key] ?? key);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldValue}>{value}</div>
    </div>
  );
}

function EditableField({ label, children, full = false }: EditableFieldProps) {
  return (
    <label className={`${styles.editField} ${full ? styles.fullSpan : ""}`.trim()}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children, tone = "default" }: SectionProps) {
  return (
    <section className={`${styles.section} ${tone === "subtle" ? styles.sectionSubtle : ""}`.trim()}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

function renderCompanyDetail(payload: CompanyDetailResponse, locale: SupportedLocale) {
  const { company } = payload;

  return (
    <>
      <Section title="Overview">
        <div className={styles.grid}>
          <Field label="Company" value={company.name} />
          <Field label="Status" value={formatStatusLabel(company.status, locale)} />
          <Field label="Country" value={company.country || "-"} />
          <Field label="Phone" value={company.phone || "-"} />
          <Field label="Registration Number" value={company.registrationNumber || "-"} />
          <Field label="Registered" value={formatDateOnly(company.createdAt, locale)} />
        </div>
      </Section>

      <Section title="Team">
        {company.members.length > 0 ? (
          <div className={styles.cards}>
            {company.members.map((member) => (
              <article key={member.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>{member.email}</div>
                  <span className="pill pill-sched">{formatStatusLabel(member.status, locale)}</span>
                </div>
                <div className={styles.grid}>
                  <Field label="Membership Role" value={member.role} />
                  <Field label="Account Role" value={member.accountRole} />
                  <Field label="City" value={member.city || "-"} />
                  <Field label="KYC" value={member.kycVerified ? "Verified" : "Pending"} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.state}>No linked users found.</div>
        )}
      </Section>

      <Section title="Recent Vehicles">
        {company.recentVehicles.length > 0 ? (
          <div className={styles.cards}>
            {company.recentVehicles.map((vehicle) => (
              <article key={vehicle.auctionId} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>{vehicle.label}</div>
                  <span className="pill pill-sched">{formatStatusLabel(vehicle.status, locale)}</span>
                </div>
                <div className={styles.grid}>
                  <Field label="Starts" value={formatDateTime(vehicle.startsAt, locale)} />
                  <Field label="Ends" value={formatDateTime(vehicle.endsAt, locale)} />
                  <Field label="Starting Price" value={formatAed(vehicle.startingPriceAed)} />
                  <Field
                    label="Buy Now"
                    value={vehicle.buyNowPriceAed == null ? "-" : formatAed(vehicle.buyNowPriceAed)}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.state}>No vehicles linked to this company yet.</div>
        )}
      </Section>
    </>
  );
}

function renderBuyerDetail(payload: UserDetailResponse, locale: SupportedLocale) {
  const { user } = payload;

  return (
    <>
      <Section title="Overview">
        <div className={styles.grid}>
          <Field label="Email" value={user.email} />
          <Field label="Account Status" value={formatStatusLabel(user.status, locale)} />
          <Field label="Role" value={user.role} />
          <Field label="City" value={user.city || "-"} />
          <Field label="Deposit Status" value={formatStatusLabel(user.depositStatus, locale)} />
          <Field label="Wallet Balance" value={formatAed(user.walletBalanceAed)} />
          <Field label="KYC" value={user.kycVerified ? "Verified" : "Pending"} />
          <Field label="Registered" value={formatDateOnly(user.createdAt, locale)} />
        </div>
      </Section>

      <Section title="Linked Company Records">
        {user.linkedCompanies.length > 0 ? (
          <div className={styles.cards}>
            {user.linkedCompanies.map((company) => (
              <article key={company.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>{company.name}</div>
                  <span className="pill pill-sched">{formatStatusLabel(company.status, locale)}</span>
                </div>
                <div className={styles.grid}>
                  <Field label="Membership Role" value={company.membershipRole} />
                  <Field label="Country" value={company.country || "-"} />
                  <Field label="Phone" value={company.phone || "-"} />
                  <Field label="Registration Number" value={company.registrationNumber || "-"} />
                  <Field label="Created" value={formatDateOnly(company.createdAt, locale)} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.state}>No linked company record found.</div>
        )}
      </Section>
    </>
  );
}

function VehicleDetailPanel({
  payload,
  locale,
  onSaved,
}: {
  payload: VehicleDetailResponse;
  locale: SupportedLocale;
  onSaved: (nextPayload: VehicleDetailResponse) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<VehicleEditState>(() => toVehicleEditState(payload.vehicle));
  const [saving, setSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<"photos" | "mulkiya-front" | "mulkiya-back" | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const mulkiyaFrontInputRef = useRef<HTMLInputElement | null>(null);
  const mulkiyaBackInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(toVehicleEditState(payload.vehicle));
  }, [payload]);

  const vehicle = payload.vehicle;
  const damageItems = useMemo(() => readDamageItems(draft.damageMap), [draft.damageMap]);
  const latestAuctionState = vehicle.latestAuction?.state?.toUpperCase() ?? null;
  const hasScheduledWindow = latestAuctionState !== "DRAFT";
  const matchedBrandKey = useMemo(() => findUaeBrandKey(draft.brand), [draft.brand]);
  const brandOptions = useMemo(() => Object.keys(UAE_BRANDS).map((key) => toBrandLabel(key)), []);
  const modelOptions = useMemo(() => {
    const nextOptions = matchedBrandKey ? UAE_BRANDS[matchedBrandKey] ?? [] : [];
    return withCurrentOption(nextOptions, draft.model);
  }, [draft.model, matchedBrandKey]);
  const seriesOptions = useMemo(() => withCurrentOption(SERIES_OPTIONS, draft.series), [draft.series]);
  const manufacturedInOptions = useMemo(
    () => withCurrentOption(MANUFACTURED_IN_OPTIONS, draft.manufacturedIn),
    [draft.manufacturedIn],
  );
  const damageSummaryOptions = useMemo(() => withCurrentOption(DAMAGE_SUMMARY_OPTIONS, draft.damage), [draft.damage]);

  function updateDraft<K extends keyof VehicleEditState>(key: K, value: VehicleEditState[K]): void {
    setDraft((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function removePhotoUrl(index: number): void {
    setDraft((previous) => ({
      ...previous,
      photoUrls: previous.photoUrls.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  async function uploadVehicleMedia(formData: FormData): Promise<UploadMediaResponse> {
    const response = await fetch("/api/seller/vehicles/upload-photos", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as UploadMediaResponse | null;

    if (!response.ok || !payload) {
      throw new Error(payload?.message ?? payload?.error ?? "Failed to upload media.");
    }

    return payload;
  }

  async function handlePhotoUpload(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) {
      return;
    }

    const formData = new FormData();

    for (const file of Array.from(files)) {
      formData.append("photos", file);
    }

    setUploadingTarget("photos");
    setFeedback(null);

    try {
      const payload = await uploadVehicleMedia(formData);
      const uploadedPhotos = payload.photos ?? [];

      if (uploadedPhotos.length === 0) {
        throw new Error("No photos were uploaded.");
      }

      setDraft((previous) => ({
        ...previous,
        photoUrls: [...previous.photoUrls, ...uploadedPhotos],
      }));
      setFeedback({
        tone: "success",
        message: `${uploadedPhotos.length} photo${uploadedPhotos.length === 1 ? "" : "s"} uploaded.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Failed to upload photos."),
      });
    } finally {
      setUploadingTarget(null);

      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
    }
  }

  async function handleMulkiyaUpload(
    side: "mulkiya-front" | "mulkiya-back",
    file: File | null,
  ): Promise<void> {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append(side === "mulkiya-front" ? "mulkiyaFront" : "mulkiyaBack", file);
    setUploadingTarget(side);
    setFeedback(null);

    try {
      const payload = await uploadVehicleMedia(formData);
      const nextUrl = side === "mulkiya-front" ? payload.mulkiyaFrontUrl : payload.mulkiyaBackUrl;

      if (!nextUrl) {
        throw new Error("Uploaded document URL was not returned.");
      }

      updateDraft(side === "mulkiya-front" ? "mulkiyaFrontUrl" : "mulkiyaBackUrl", nextUrl);
      setFeedback({
        tone: "success",
        message: side === "mulkiya-front" ? "Mulkiya front uploaded." : "Mulkiya back uploaded.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Failed to upload Mulkiya."),
      });
    } finally {
      setUploadingTarget(null);

      const targetRef = side === "mulkiya-front" ? mulkiyaFrontInputRef : mulkiyaBackInputRef;

      if (targetRef.current) {
        targetRef.current.value = "";
      }
    }
  }

  function updateFeatureFlag<
    K extends FeatureSectionKey,
    T extends keyof FeatureSectionGroup[K],
  >(section: K, featureKey: T, checked: boolean): void {
    setDraft((previous) => {
      const nextSection = {
        ...previous.features[section],
        [featureKey]: checked,
      } as FeatureSectionGroup[K];
      const nextFeatures: SellerVehicleFeatures = {
        ...previous.features,
        [section]: nextSection,
      };

      if (section === "technology" && featureKey === "premiumSound" && !checked) {
        nextFeatures.soundBrand = "";
      }

      return {
        ...previous,
        features: nextFeatures,
      };
    });
  }

  function updateInteriorMaterial(value: SellerVehicleFeatures["interiorMaterial"]): void {
    setDraft((previous) => ({
      ...previous,
      features: {
        ...previous.features,
        interiorMaterial: value,
      },
    }));
  }

  function updateSoundBrand(value: SellerVehicleFeatures["soundBrand"]): void {
    setDraft((previous) => ({
      ...previous,
      features: {
        ...previous.features,
        soundBrand: value,
      },
    }));
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setFeedback(null);

    try {
      const nextPayload = await api.admin.vehicles.update<VehicleDetailResponse>(vehicle.id, toVehicleUpdatePayload(draft));
      onSaved(nextPayload);
      setFeedback({
        tone: "success",
        message: "Vehicle details updated successfully.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: getApiErrorMessage(error, "Failed to update vehicle."),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Section title="Overview">
        <div className={styles.gridWide}>
          <Field label="Vehicle" value={vehicle.label} />
          <Field label="Status" value={formatStatusLabel(vehicle.status, locale)} />
          <Field label="Company" value={vehicle.company?.name || "-"} />
          <Field label="Approval" value={vehicle.latestAuction?.approvalStatusLabel || "-"} />
          <Field label="Auction State" value={vehicle.latestAuction ? formatStatusLabel(vehicle.latestAuction.state, locale) : "-"} />
          <Field
            label="Assigned Event"
            value={
              vehicle.assignedEvent
                ? `${vehicle.assignedEvent.title} • ${formatDateTime(vehicle.assignedEvent.startsAt, locale)}`
                : "-"
            }
          />
        </div>
      </Section>

      <Section title="Photos & Documents">
        <div className={styles.formStack}>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className={styles.hiddenFileInput}
            onChange={(event) => void handlePhotoUpload(event.target.files)}
          />
          <input
            ref={mulkiyaFrontInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className={styles.hiddenFileInput}
            onChange={(event) => void handleMulkiyaUpload("mulkiya-front", event.target.files?.[0] ?? null)}
          />
          <input
            ref={mulkiyaBackInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className={styles.hiddenFileInput}
            onChange={(event) => void handleMulkiyaUpload("mulkiya-back", event.target.files?.[0] ?? null)}
          />

          <div className={styles.toolbarRow}>
            <div>
              <span className={styles.fieldLabel}>Vehicle Photos</span>
              <p className={styles.helperText}>Upload photos from your computer, then remove any outdated images.</p>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              disabled={uploadingTarget === "photos"}
              onClick={() => photoInputRef.current?.click()}
            >
              {uploadingTarget === "photos" ? "Uploading..." : "Add Photos From Computer"}
            </button>
          </div>

          {draft.photoUrls.length > 0 ? (
            <div className={styles.mediaCards}>
              {draft.photoUrls.map((url, index) => (
                <article key={`${url}-${index}`} className={styles.mediaCard}>
                  {url ? isPdfUrl(url) ? (
                    <div className={styles.documentPreview}>
                      <span className={styles.documentType}>PDF</span>
                      <a href={url} target="_blank" rel="noreferrer" className={styles.documentLink}>
                        Open uploaded file
                      </a>
                    </div>
                  ) : (
                    <img src={url} alt={`${vehicle.label} ${index + 1}`} className={styles.photo} />
                  ) : (
                    <div className={styles.photoPlaceholder}>Photo preview</div>
                  )}
                  <div className={styles.mediaCardBody}>
                    <span className={styles.fieldLabel}>Photo {index + 1}</span>
                    <div className={styles.previewActions}>
                      <a href={url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                        Open
                      </a>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => removePhotoUrl(index)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.state}>No photos added yet.</div>
          )}

          <div className={styles.formGridTwo}>
            <article className={styles.documentCard}>
              <span className={styles.fieldLabel}>Mulkiya Front</span>
              {draft.mulkiyaFrontUrl ? (
                isPdfUrl(draft.mulkiyaFrontUrl) ? (
                  <div className={styles.documentPreview}>
                    <span className={styles.documentType}>PDF</span>
                    <a href={draft.mulkiyaFrontUrl} target="_blank" rel="noreferrer" className={styles.documentLink}>
                      View front document
                    </a>
                  </div>
                ) : (
                  <img src={draft.mulkiyaFrontUrl} alt="Mulkiya front" className={styles.photo} />
                )
              ) : (
                <div className={styles.photoPlaceholder}>Front side not uploaded</div>
              )}
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={uploadingTarget === "mulkiya-front"}
                  onClick={() => mulkiyaFrontInputRef.current?.click()}
                >
                  {uploadingTarget === "mulkiya-front" ? "Uploading..." : draft.mulkiyaFrontUrl ? "Replace" : "Upload"}
                </button>
                {draft.mulkiyaFrontUrl ? (
                  <>
                    <a href={draft.mulkiyaFrontUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                      Open
                    </a>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => updateDraft("mulkiyaFrontUrl", "")}
                    >
                      Clear
                    </button>
                  </>
                ) : null}
              </div>
            </article>

            <article className={styles.documentCard}>
              <span className={styles.fieldLabel}>Mulkiya Back</span>
              {draft.mulkiyaBackUrl ? (
                isPdfUrl(draft.mulkiyaBackUrl) ? (
                  <div className={styles.documentPreview}>
                    <span className={styles.documentType}>PDF</span>
                    <a href={draft.mulkiyaBackUrl} target="_blank" rel="noreferrer" className={styles.documentLink}>
                      View back document
                    </a>
                  </div>
                ) : (
                  <img src={draft.mulkiyaBackUrl} alt="Mulkiya back" className={styles.photo} />
                )
              ) : (
                <div className={styles.photoPlaceholder}>Back side not uploaded</div>
              )}
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={uploadingTarget === "mulkiya-back"}
                  onClick={() => mulkiyaBackInputRef.current?.click()}
                >
                  {uploadingTarget === "mulkiya-back" ? "Uploading..." : draft.mulkiyaBackUrl ? "Replace" : "Upload"}
                </button>
                {draft.mulkiyaBackUrl ? (
                  <>
                    <a href={draft.mulkiyaBackUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                      Open
                    </a>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => updateDraft("mulkiyaBackUrl", "")}
                    >
                      Clear
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          </div>
        </div>
      </Section>

      <Section title="Vehicle Information">
        <div className={styles.formStack}>
          <div className={styles.formGridFour}>
            <EditableField label="Brand">
              <select value={draft.brand} onChange={(event) => updateDraft("brand", event.target.value)}>
                <option value="">Select brand</option>
                {withCurrentOption(brandOptions, draft.brand).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Model">
              <select value={draft.model} onChange={(event) => updateDraft("model", event.target.value)}>
                <option value="">Select model</option>
                {modelOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Year">
              <input type="number" min={1886} value={draft.year} onChange={(event) => updateDraft("year", event.target.value)} />
            </EditableField>
            <EditableField label="Series / Trim">
              <select value={draft.series} onChange={(event) => updateDraft("series", event.target.value)}>
                <option value="">Select series / trim</option>
                {seriesOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
          </div>

          <div className={styles.formGridFour}>
            <EditableField label="Mileage (km)">
              <input type="number" min={0} value={draft.mileage} onChange={(event) => updateDraft("mileage", event.target.value)} />
            </EditableField>
            <EditableField label="Cylinders">
              <select value={draft.cylinders} onChange={(event) => updateDraft("cylinders", event.target.value)}>
                {CYLINDER_OPTIONS.map((option) => (
                  <option key={option || "empty"} value={option}>
                    {option || "Select cylinders"}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Engine">
              <input value={draft.engine} onChange={(event) => updateDraft("engine", event.target.value)} />
            </EditableField>
            <EditableField label="Drive Type">
              <select value={draft.driveType} onChange={(event) => updateDraft("driveType", event.target.value)}>
                {DRIVE_TYPE_OPTIONS.map((option) => (
                  <option key={option || "empty"} value={option}>
                    {option || "Select drive type"}
                  </option>
                ))}
              </select>
            </EditableField>
          </div>

          <div className={styles.formGridFour}>
            <EditableField label="Fuel Type">
              <select value={draft.fuelType} onChange={(event) => updateDraft("fuelType", event.target.value)}>
                <option value="">Select fuel type</option>
                {withCurrentOption(FUEL_TYPES, draft.fuelType).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Transmission">
              <select value={draft.transmission} onChange={(event) => updateDraft("transmission", event.target.value)}>
                <option value="">Select transmission</option>
                {withCurrentOption(TRANSMISSION_TYPES, draft.transmission).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Body Type">
              <select value={draft.bodyType} onChange={(event) => updateDraft("bodyType", event.target.value)}>
                <option value="">Select body type</option>
                {withCurrentOption(BODY_TYPES, draft.bodyType).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Region Spec">
              <select value={draft.regionSpec} onChange={(event) => updateDraft("regionSpec", event.target.value)}>
                <option value="">Select region spec</option>
                {withCurrentOption(REGION_SPECS, draft.regionSpec).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
          </div>

          <div className={styles.formGridFour}>
            <EditableField label="Exterior Color">
              <select value={draft.exteriorColor} onChange={(event) => updateDraft("exteriorColor", event.target.value)}>
                <option value="">Select exterior color</option>
                {withCurrentOption(COLORS, draft.exteriorColor).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Interior Color">
              <select value={draft.interiorColor} onChange={(event) => updateDraft("interiorColor", event.target.value)}>
                <option value="">Select interior color</option>
                {withCurrentOption(COLORS, draft.interiorColor).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Manufactured In">
              <select value={draft.manufacturedIn} onChange={(event) => updateDraft("manufacturedIn", event.target.value)}>
                <option value="">Select country</option>
                {manufacturedInOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Airbags">
              <select value={draft.airbags} onChange={(event) => updateDraft("airbags", event.target.value)}>
                {AIRBAG_OPTIONS.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </EditableField>
          </div>

          <div className={styles.formGridFour}>
            <EditableField label="Number of Keys">
              <select value={draft.numberOfKeys} onChange={(event) => updateDraft("numberOfKeys", event.target.value)}>
                {NUMBER_OF_KEYS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Warranty Status">
              <select value={draft.warrantyStatus} onChange={(event) => updateDraft("warrantyStatus", event.target.value)}>
                {WARRANTY_STATUS_OPTIONS.map((option) => (
                  <option key={option || "empty"} value={option}>
                    {option || "Select warranty status"}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Start Code">
              <select value={draft.startCode} onChange={(event) => updateDraft("startCode", event.target.value)}>
                <option value="">Select start code</option>
                {START_CODE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="VIN">
              <input value={draft.vin} onChange={(event) => updateDraft("vin", event.target.value.toUpperCase())} />
            </EditableField>
          </div>

          <div className={styles.formGridTwo}>
            <EditableField label="Service History">
              <select value={draft.serviceHistory} onChange={(event) => updateDraft("serviceHistory", event.target.value)}>
                <option value="">Select service history</option>
                {withCurrentOption(SERVICE_HISTORY_OPTIONS, draft.serviceHistory).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Description">
              <textarea rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} />
            </EditableField>
          </div>

          <EditableField label="Damage Summary" full>
            <select value={draft.damage} onChange={(event) => updateDraft("damage", event.target.value)}>
              <option value="">Select damage summary</option>
                {damageSummaryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
            </select>
          </EditableField>

          <div className={styles.damageSection}>
            <div className={styles.damageHeader}>
              <span className={styles.fieldLabel}>Damage Map</span>
              <span className={styles.helperText}>Use the existing diagram to update mapped damage zones.</span>
            </div>
            <DamageDiagram value={draft.damageMap} onChange={(next) => updateDraft("damageMap", next)} locale={locale} />
            {damageItems.length > 0 ? (
              <ul className={styles.list}>
                {damageItems.map((item) => (
                  <li key={`${item.label}-${item.level}`}>
                    {item.label} — {item.level}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Inspection & Valuation" tone="subtle">
        <div className={styles.formStack}>
          <div className={styles.formGridTwo}>
            <EditableField label="Condition Grade">
              <select value={draft.conditionGrade} onChange={(event) => updateDraft("conditionGrade", event.target.value)}>
                {CONDITION_GRADE_OPTIONS.map((option) => (
                  <option key={option || "empty"} value={option}>
                    {option || "Select condition grade"}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Estimated Value AED">
              <input
                type="number"
                min={0}
                value={draft.estimatedValueAed}
                onChange={(event) => updateDraft("estimatedValueAed", event.target.value)}
              />
            </EditableField>
          </div>

          <EditableField label="Title Status">
            <select value={draft.titleStatus} onChange={(event) => updateDraft("titleStatus", event.target.value)}>
              {TITLE_STATUS_OPTIONS.map((option) => (
                <option key={option || "empty"} value={option}>
                  {option || "Select title status"}
                </option>
              ))}
            </select>
          </EditableField>

          <EditableField label="Primary Damage">
            <select value={draft.primaryDamage} onChange={(event) => updateDraft("primaryDamage", event.target.value)}>
              {PRIMARY_DAMAGE_OPTIONS.map((option) => (
                <option key={option || "empty"} value={option}>
                  {option || "Select primary damage"}
                </option>
              ))}
            </select>
          </EditableField>

          <EditableField label="Loss Type">
            <select value={draft.lossType} onChange={(event) => updateDraft("lossType", event.target.value)}>
              {LOSS_TYPE_OPTIONS.map((option) => (
                <option key={option || "empty"} value={option}>
                  {option || "Select loss type"}
                </option>
              ))}
            </select>
          </EditableField>

          <EditableField label="Tire Condition %">
            <input
              type="number"
              min={0}
              max={100}
              value={draft.tireCondition}
              onChange={(event) => updateDraft("tireCondition", event.target.value)}
            />
          </EditableField>

          <EditableField label="Internal Notes" full>
            <textarea
              rows={4}
              value={draft.internalNotes}
              onChange={(event) => updateDraft("internalNotes", event.target.value)}
            />
          </EditableField>
        </div>
      </Section>

      <Section title="Features">
        <div className={styles.featureEditorGrid}>
          <article className={styles.featureEditorCard}>
            <div className={styles.featureGroupHeader}>
              <span className={styles.featureIcon}>
                <IconTag size={16} />
              </span>
              <div>
                <h4 className={styles.featureGroupTitle}>Comfort</h4>
                <p className={styles.helperText}>Seats, roof and interior appointments.</p>
              </div>
            </div>
            <div className={styles.featureOptionGrid}>
              {COMFORT_INTERIOR_OPTIONS.map((item) => (
                <label
                  key={item.key}
                  className={`${styles.checkboxItem} ${draft.features.comfortInterior[item.key] ? styles.checkboxItemChecked : ""}`.trim()}
                >
                  <input
                    type="checkbox"
                    checked={draft.features.comfortInterior[item.key]}
                    onChange={(event) => updateFeatureFlag("comfortInterior", item.key, event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </article>

          <article className={styles.featureEditorCard}>
            <div className={styles.featureGroupHeader}>
              <span className={styles.featureIcon}>
                <IconShield size={16} />
              </span>
              <div>
                <h4 className={styles.featureGroupTitle}>Safety</h4>
                <p className={styles.helperText}>Driver assistance, cameras and parking systems.</p>
              </div>
            </div>
            <div className={styles.featureOptionGrid}>
              {SAFETY_OPTIONS.map((item) => (
                <label
                  key={item.key}
                  className={`${styles.checkboxItem} ${draft.features.safety[item.key] ? styles.checkboxItemChecked : ""}`.trim()}
                >
                  <input
                    type="checkbox"
                    checked={draft.features.safety[item.key]}
                    onChange={(event) => updateFeatureFlag("safety", item.key, event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </article>

          <article className={styles.featureEditorCard}>
            <div className={styles.featureGroupHeader}>
              <span className={styles.featureIcon}>
                <IconTag size={16} />
              </span>
              <div>
                <h4 className={styles.featureGroupTitle}>Interior Material</h4>
                <p className={styles.helperText}>Keep upholstery separate from the comfort equipment checklist.</p>
              </div>
            </div>
            <div className={styles.radioGroup}>
              {INTERIOR_MATERIAL_OPTIONS.map((item) => (
                <label
                  key={item}
                  className={`${styles.radioCard} ${draft.features.interiorMaterial === item ? styles.radioCardActive : ""}`.trim()}
                >
                  <input
                    type="radio"
                    name="admin-interior-material"
                    checked={draft.features.interiorMaterial === item}
                    onChange={() => updateInteriorMaterial(item)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </article>

          <article className={styles.featureEditorCard}>
            <div className={styles.featureGroupHeader}>
              <span className={styles.featureIcon}>
                <IconZap size={16} />
              </span>
              <div>
                <h4 className={styles.featureGroupTitle}>Technology</h4>
                <p className={styles.helperText}>Infotainment, connectivity and premium electronics.</p>
              </div>
            </div>
            <div className={styles.featureOptionGrid}>
              {TECHNOLOGY_OPTIONS.map((item) => (
                <label
                  key={item.key}
                  className={`${styles.checkboxItem} ${draft.features.technology[item.key] ? styles.checkboxItemChecked : ""}`.trim()}
                >
                  <input
                    type="checkbox"
                    checked={draft.features.technology[item.key]}
                    onChange={(event) => updateFeatureFlag("technology", item.key, event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            {draft.features.technology.premiumSound ? (
              <EditableField label="Premium Sound Brand">
                <select value={draft.features.soundBrand} onChange={(event) => updateSoundBrand(event.target.value as SellerVehicleFeatures["soundBrand"])}>
                  {SOUND_BRAND_OPTIONS.map((option) => (
                    <option key={option || "empty"} value={option}>
                      {option || "Select sound brand"}
                    </option>
                  ))}
                </select>
              </EditableField>
            ) : null}
          </article>

          <article className={styles.featureEditorCard}>
            <div className={styles.featureGroupHeader}>
              <span className={styles.featureIcon}>
                <IconCar size={16} />
              </span>
              <div>
                <h4 className={styles.featureGroupTitle}>Exterior</h4>
                <p className={styles.helperText}>Utility, wheels and body accessories.</p>
              </div>
            </div>
            <div className={styles.featureOptionGrid}>
              {EXTERIOR_OPTIONS.map((item) => (
                <label
                  key={item.key}
                  className={`${styles.checkboxItem} ${draft.features.exterior[item.key] ? styles.checkboxItemChecked : ""}`.trim()}
                >
                  <input
                    type="checkbox"
                    checked={draft.features.exterior[item.key]}
                    onChange={(event) => updateFeatureFlag("exterior", item.key, event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </article>
        </div>
      </Section>

      <Section title="Auction">
        <div className={styles.gridWide}>
          <Field label="Starting Price" value={vehicle.latestAuction ? formatAed(vehicle.latestAuction.startingPriceAed) : "-"} />
          <Field label="Current Price" value={vehicle.latestAuction ? formatAed(vehicle.latestAuction.currentPriceAed) : "-"} />
          <Field
            label="Buy Now"
            value={vehicle.latestAuction?.buyNowPriceAed == null ? "-" : formatAed(vehicle.latestAuction.buyNowPriceAed)}
          />
          <Field label="Min Increment" value={vehicle.latestAuction ? formatAed(vehicle.latestAuction.minIncrementAed) : "-"} />
          <Field label="Starts" value={hasScheduledWindow ? formatDateTime(vehicle.latestAuction?.startsAt, locale) : "-"} />
          <Field label="Ends" value={hasScheduledWindow ? formatDateTime(vehicle.latestAuction?.endsAt, locale) : "-"} />
          <Field label="Inspection Drop-off" value={formatDateTime(vehicle.latestAuction?.inspectionDropoffDate, locale)} />
          <Field label="Viewing Ends" value={hasScheduledWindow ? formatDateTime(vehicle.latestAuction?.viewingEndsAt, locale) : "-"} />
          <Field label="Auction Starts" value={hasScheduledWindow ? formatDateTime(vehicle.latestAuction?.auctionStartsAt, locale) : "-"} />
          <Field label="Auction Ends" value={hasScheduledWindow ? formatDateTime(vehicle.latestAuction?.auctionEndsAt, locale) : "-"} />
        </div>
      </Section>

      <div className={styles.footer}>
        {feedback ? (
          <p className={`inline-note ${feedback.tone === "success" ? "tone-success" : "tone-error"} ${styles.feedback}`}>
            {feedback.message}
          </p>
        ) : null}
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving..." : "Save Vehicle Changes"}
        </button>
      </div>
    </>
  );
}

export function AdminDetailModal({
  entity,
  locale,
  onClose,
}: {
  entity: DetailEntity;
  locale: SupportedLocale;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<DetailPayload>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const nextPayload =
          entity.kind === "company"
            ? await api.admin.companies.get<CompanyDetailResponse>(entity.id, { cache: "no-store" })
            : entity.kind === "buyer"
              ? await api.admin.users.get<UserDetailResponse>(entity.id, { cache: "no-store" })
              : await api.admin.vehicles.get<VehicleDetailResponse>(entity.id, { cache: "no-store" });

        if (!cancelled) {
          setPayload(nextPayload);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(getApiErrorMessage(nextError, "Failed to load details."));
          setPayload(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [entity.id, entity.kind]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const subtitle = useMemo(() => {
    if (entity.kind === "company") {
      return "Company details";
    }

    if (entity.kind === "buyer") {
      return "Buyer details";
    }

    return "Vehicle details";
  }, [entity.kind]);

  const modalTitle = useMemo(() => {
    if (entity.kind === "vehicle" && payload && "vehicle" in payload) {
      return payload.vehicle.label;
    }

    return entity.label;
  }, [entity.kind, entity.label, payload]);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="admin-detail-title" onClick={onClose}>
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.titleWrap}>
            <span className={styles.eyebrow}>{subtitle}</span>
            <h2 id="admin-detail-title" className={styles.title}>
              {modalTitle}
            </h2>
            <div className={styles.metaRow}>
              <span className="pill">{entity.id}</span>
            </div>
          </div>
          <button type="button" className={`btn btn-outline btn-sm ${styles.closeButton}`} onClick={onClose}>
            Close
          </button>
        </header>

        <div className={styles.body}>
          {loading ? <div className={styles.state}>Loading details...</div> : null}
          {!loading && error ? (
            <div className={styles.state} role="alert">
              {error}
            </div>
          ) : null}
          {!loading && !error && payload && entity.kind === "company" ? renderCompanyDetail(payload as CompanyDetailResponse, locale) : null}
          {!loading && !error && payload && entity.kind === "buyer" ? renderBuyerDetail(payload as UserDetailResponse, locale) : null}
          {!loading && !error && payload && entity.kind === "vehicle" ? (
            <VehicleDetailPanel payload={payload as VehicleDetailResponse} locale={locale} onSaved={setPayload} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

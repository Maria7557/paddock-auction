"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { getAdminCopy } from "@/app/admin/i18n";
import { DamageDiagram, type DamageMapValue } from "@/components/seller/DamageDiagram";
import { EMPTY_VEHICLE_FORM, type SellerVehicleFeatures } from "@/components/seller/vehicle-form-state";
import { IconCar, IconShield, IconTag, IconZap } from "@/components/ui/icons";
import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { toIntlLocale, type SupportedLocale } from "@/src/i18n/routing";
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
    marketPriceAed: number | null;
    status: string;
    photoUrls: string[];
    mulkiyaFrontUrl: string | null;
    mulkiyaBackUrl: string | null;
    fuelType: string | null;
    transmission: string | null;
    bodyType: string | null;
    regionSpec: string | null;
    condition: string | null;
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
  brand: string;
  model: string;
  year: string;
  series: string;
  vin: string;
  marketPriceAed: string;
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
  condition: string;
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

type FeatureSummaryGroup = {
  key: "comfort" | "safety" | "technology" | "exterior";
  title: string;
  icon: ReactNode;
  items: string[];
};

const START_CODE_OPTIONS = ["Run and Drive", "Stationary", "Does Not Start"] as const;
const NUMBER_OF_KEYS_OPTIONS = ["0", "1", "2", "3"] as const;
const WARRANTY_STATUS_OPTIONS = ["", "Active", "Expired", "None"] as const;
const CONDITION_GRADE_OPTIONS = ["", "A", "B", "C", "D"] as const;
const TITLE_STATUS_OPTIONS = ["", "Clean", "Salvage", "Flood", "Fire"] as const;
const PRIMARY_DAMAGE_OPTIONS = ["", "None", "Front End", "Rear End", "Side", "Roof", "Undercarriage", "All Over"] as const;
const LOSS_TYPE_OPTIONS = ["", "None", "Collision", "Flood", "Fire", "Theft", "Other"] as const;
const CYLINDER_OPTIONS = ["", "3", "4", "5", "6", "8", "10", "12"] as const;

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
    return EMPTY_VEHICLE_FORM;
  }

  const comfortInterior = isRecord(value.comfortInterior) ? value.comfortInterior : {};
  const safety = isRecord(value.safety) ? value.safety : {};
  const technology = isRecord(value.technology) ? value.technology : {};
  const exterior = isRecord(value.exterior) ? value.exterior : {};

  const normalizedTechnology = {
    ...EMPTY_VEHICLE_FORM.technology,
    ...Object.fromEntries(
      Object.keys(EMPTY_VEHICLE_FORM.technology).map((key) => [key, technology[key] === true]),
    ),
  };

  return {
    comfortInterior: {
      ...EMPTY_VEHICLE_FORM.comfortInterior,
      ...Object.fromEntries(
        Object.keys(EMPTY_VEHICLE_FORM.comfortInterior).map((key) => [key, comfortInterior[key] === true]),
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
      ...EMPTY_VEHICLE_FORM.safety,
      ...Object.fromEntries(
        Object.keys(EMPTY_VEHICLE_FORM.safety).map((key) => [key, safety[key] === true]),
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
      ...EMPTY_VEHICLE_FORM.exterior,
      ...Object.fromEntries(
        Object.keys(EMPTY_VEHICLE_FORM.exterior).map((key) => [key, exterior[key] === true]),
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

function toVehicleEditState(vehicle: VehicleDetailResponse["vehicle"]): VehicleEditState {
  return {
    brand: vehicle.brand,
    model: vehicle.model,
    year: String(vehicle.year),
    series: vehicle.series ?? "",
    vin: vehicle.vin,
    marketPriceAed: vehicle.marketPriceAed == null ? "" : String(vehicle.marketPriceAed),
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
    condition: vehicle.condition ?? "",
    airbags: vehicle.airbags ?? "",
    serviceHistory: vehicle.serviceHistory ?? "",
    description: vehicle.description ?? "",
    damage: vehicle.damage ?? "",
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
    brand: draft.brand.trim(),
    model: draft.model.trim(),
    year: Number(draft.year),
    series: draft.series.trim() || null,
    vin: draft.vin.trim().toUpperCase(),
    marketPriceAed: toOptionalNumber(draft.marketPriceAed),
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
    condition: draft.condition.trim() || null,
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
  return Object.entries(source ?? {})
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => labels[key] ?? key);
}

function getFeatureSummaryGroups(features: SellerVehicleFeatures): FeatureSummaryGroup[] {
  const comfort = collectFeatureLabels(features.comfortInterior, COMFORT_FEATURE_LABELS);
  if (features.interiorMaterial) {
    comfort.push(`Interior material: ${features.interiorMaterial}`);
  }

  const safety = collectFeatureLabels(features.safety, SAFETY_FEATURE_LABELS);
  const technology = collectFeatureLabels(features.technology, TECHNOLOGY_FEATURE_LABELS);
  if (features.technology.premiumSound && features.soundBrand) {
    technology.push(`Sound brand: ${features.soundBrand}`);
  }

  return [
    {
      key: "comfort",
      title: "Comfort",
      icon: <IconTag size={16} />,
      items: comfort,
    },
    {
      key: "safety",
      title: "Safety",
      icon: <IconShield size={16} />,
      items: safety,
    },
    {
      key: "technology",
      title: "Technology",
      icon: <IconZap size={16} />,
      items: technology,
    },
    {
      key: "exterior",
      title: "Exterior",
      icon: <IconCar size={16} />,
      items: collectFeatureLabels(features.exterior, EXTERIOR_FEATURE_LABELS),
    },
  ];
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
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    setDraft(toVehicleEditState(payload.vehicle));
  }, [payload]);

  const vehicle = payload.vehicle;
  const featureGroups = useMemo(() => getFeatureSummaryGroups(readVehicleFeatures(vehicle.features)), [vehicle.features]);
  const damageItems = useMemo(() => readDamageItems(draft.damageMap), [draft.damageMap]);
  const latestAuctionState = vehicle.latestAuction?.state?.toUpperCase() ?? null;
  const hasScheduledWindow = latestAuctionState !== "DRAFT";

  function updateDraft<K extends keyof VehicleEditState>(key: K, value: VehicleEditState[K]): void {
    setDraft((previous) => ({
      ...previous,
      [key]: value,
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
        {vehicle.photoUrls.length > 0 ? (
          <div className={styles.photoGrid}>
            {vehicle.photoUrls.map((url, index) => (
              <img key={`${url}-${index}`} src={url} alt={`${vehicle.label} ${index + 1}`} className={styles.photo} />
            ))}
          </div>
        ) : (
          <div className={styles.state}>No photos uploaded.</div>
        )}
        {vehicle.mulkiyaFrontUrl || vehicle.mulkiyaBackUrl ? (
          <div className={styles.docLinks}>
            {vehicle.mulkiyaFrontUrl ? (
              <a href={vehicle.mulkiyaFrontUrl} target="_blank" rel="noreferrer" className={styles.docLink}>
                Mulkiya Front
              </a>
            ) : null}
            {vehicle.mulkiyaBackUrl ? (
              <a href={vehicle.mulkiyaBackUrl} target="_blank" rel="noreferrer" className={styles.docLink}>
                Mulkiya Back
              </a>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="Vehicle Information">
        <div className={styles.formStack}>
          <div className={styles.formGridFour}>
            <EditableField label="VIN">
              <input value={draft.vin} onChange={(event) => updateDraft("vin", event.target.value.toUpperCase())} />
            </EditableField>
            <EditableField label="Market Price AED">
              <input
                type="number"
                min={0}
                value={draft.marketPriceAed}
                onChange={(event) => updateDraft("marketPriceAed", event.target.value)}
              />
            </EditableField>
            <EditableField label="Condition">
              <input value={draft.condition} onChange={(event) => updateDraft("condition", event.target.value)} />
            </EditableField>
            <EditableField label="Airbags">
              <input value={draft.airbags} onChange={(event) => updateDraft("airbags", event.target.value)} />
            </EditableField>
          </div>

          <div className={styles.formGridFour}>
            <EditableField label="Brand">
              <input value={draft.brand} onChange={(event) => updateDraft("brand", event.target.value)} />
            </EditableField>
            <EditableField label="Model">
              <input value={draft.model} onChange={(event) => updateDraft("model", event.target.value)} />
            </EditableField>
            <EditableField label="Year">
              <input type="number" min={1886} value={draft.year} onChange={(event) => updateDraft("year", event.target.value)} />
            </EditableField>
            <EditableField label="Series / Trim">
              <input value={draft.series} onChange={(event) => updateDraft("series", event.target.value)} />
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
              <input value={draft.driveType} onChange={(event) => updateDraft("driveType", event.target.value)} />
            </EditableField>
          </div>

          <div className={styles.formGridFour}>
            <EditableField label="Fuel Type">
              <input value={draft.fuelType} onChange={(event) => updateDraft("fuelType", event.target.value)} />
            </EditableField>
            <EditableField label="Transmission">
              <input value={draft.transmission} onChange={(event) => updateDraft("transmission", event.target.value)} />
            </EditableField>
            <EditableField label="Body Type">
              <input value={draft.bodyType} onChange={(event) => updateDraft("bodyType", event.target.value)} />
            </EditableField>
            <EditableField label="Region Spec">
              <input value={draft.regionSpec} onChange={(event) => updateDraft("regionSpec", event.target.value)} />
            </EditableField>
          </div>

          <div className={styles.formGridThree}>
            <EditableField label="Exterior Color">
              <input value={draft.exteriorColor} onChange={(event) => updateDraft("exteriorColor", event.target.value)} />
            </EditableField>
            <EditableField label="Interior Color">
              <input value={draft.interiorColor} onChange={(event) => updateDraft("interiorColor", event.target.value)} />
            </EditableField>
            <EditableField label="Manufactured In">
              <input value={draft.manufacturedIn} onChange={(event) => updateDraft("manufacturedIn", event.target.value)} />
            </EditableField>
          </div>

          <div className={styles.formGridThree}>
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
          </div>

          <div className={styles.formGridTwo}>
            <EditableField label="Service History" full>
              <textarea
                rows={4}
                value={draft.serviceHistory}
                onChange={(event) => updateDraft("serviceHistory", event.target.value)}
              />
            </EditableField>
            <EditableField label="Description" full>
              <textarea rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} />
            </EditableField>
          </div>

          <EditableField label="Damage Summary" full>
            <textarea rows={3} value={draft.damage} onChange={(event) => updateDraft("damage", event.target.value)} />
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
        <div className={styles.featureGroups}>
          {featureGroups.map((group) => (
            <article key={group.key} className={styles.featureGroup}>
              <div className={styles.featureGroupHeader}>
                <span className={styles.featureIcon}>{group.icon}</span>
                <h4 className={styles.featureGroupTitle}>{group.title}</h4>
              </div>
              {group.items.length > 0 ? (
                <div className={styles.badgeList}>
                  {group.items.map((item) => (
                    <span key={item} className={styles.badge}>
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className={styles.helperText}>No seller selections recorded.</p>
              )}
            </article>
          ))}
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

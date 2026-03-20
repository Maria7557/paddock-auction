"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { getAdminCopy } from "@/app/admin/i18n";
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
    engine: string | null;
    driveType: string | null;
    exteriorColor: string | null;
    interiorColor: string | null;
    airbags: string | null;
    damage: string | null;
    damageMap: unknown;
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
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, "MINOR" | "MAJOR"] => entry[1] === "MINOR" || entry[1] === "MAJOR")
    .sort(([left], [right]) => (DAMAGE_ZONE_LABELS[left] ?? left).localeCompare(DAMAGE_ZONE_LABELS[right] ?? right))
    .map(([zoneId, level]) => ({
      label: DAMAGE_ZONE_LABELS[zoneId] ?? zoneId,
      level: level === "MINOR" ? "Minor" : "Major",
    }));
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldValue}>{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
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

function renderVehicleDetail(payload: VehicleDetailResponse, locale: SupportedLocale) {
  const { vehicle } = payload;
  const damageItems = readDamageItems(vehicle.damageMap);

  return (
    <>
      <Section title="Overview">
        <div className={styles.gridWide}>
          <Field label="Vehicle" value={vehicle.label} />
          <Field label="Status" value={formatStatusLabel(vehicle.status, locale)} />
          <Field label="Company" value={vehicle.company?.name || "-"} />
          <Field label="VIN" value={vehicle.vin} />
          <Field label="Year" value={String(vehicle.year)} />
          <Field label="Mileage" value={`${formatNumber(vehicle.mileage)} km`} />
          <Field
            label="Market Price"
            value={vehicle.marketPriceAed == null ? "-" : formatAed(vehicle.marketPriceAed)}
          />
          <Field label="Fuel Type" value={vehicle.fuelType || "-"} />
          <Field label="Transmission" value={vehicle.transmission || "-"} />
        </div>
      </Section>

      <Section title="Photos">
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

      <Section title="Specifications">
        <div className={styles.gridWide}>
          <Field label="Body Type" value={vehicle.bodyType || "-"} />
          <Field label="Region Spec" value={vehicle.regionSpec || "-"} />
          <Field label="Condition" value={vehicle.condition || "-"} />
          <Field label="Service History" value={vehicle.serviceHistory || "-"} />
          <Field label="Engine" value={vehicle.engine || "-"} />
          <Field label="Drive Type" value={vehicle.driveType || "-"} />
          <Field label="Exterior Color" value={vehicle.exteriorColor || "-"} />
          <Field label="Interior Color" value={vehicle.interiorColor || "-"} />
          <Field label="Airbags" value={vehicle.airbags || "-"} />
        </div>
      </Section>

      <Section title="Auction">
        <div className={styles.gridWide}>
          <Field
            label="Starting Price"
            value={vehicle.latestAuction ? formatAed(vehicle.latestAuction.startingPriceAed) : "-"}
          />
          <Field
            label="Current Price"
            value={vehicle.latestAuction ? formatAed(vehicle.latestAuction.currentPriceAed) : "-"}
          />
          <Field
            label="Buy Now"
            value={
              vehicle.latestAuction?.buyNowPriceAed == null
                ? "-"
                : formatAed(vehicle.latestAuction.buyNowPriceAed)
            }
          />
          <Field
            label="Min Increment"
            value={vehicle.latestAuction ? formatAed(vehicle.latestAuction.minIncrementAed) : "-"}
          />
          <Field label="Starts" value={formatDateTime(vehicle.latestAuction?.startsAt, locale)} />
          <Field label="Ends" value={formatDateTime(vehicle.latestAuction?.endsAt, locale)} />
          <Field label="Approval" value={vehicle.latestAuction?.approvalStatusLabel || "-"} />
          <Field
            label="Inspection Drop-off"
            value={formatDateTime(vehicle.latestAuction?.inspectionDropoffDate, locale)}
          />
          <Field label="Viewing Ends" value={formatDateTime(vehicle.latestAuction?.viewingEndsAt, locale)} />
          <Field label="Auction Starts" value={formatDateTime(vehicle.latestAuction?.auctionStartsAt, locale)} />
          <Field label="Auction Ends" value={formatDateTime(vehicle.latestAuction?.auctionEndsAt, locale)} />
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

      <Section title="Damage & Notes">
        <div className={styles.grid}>
          <Field label="Damage Summary" value={vehicle.damage || "-"} />
          <Field
            label="Damage Map"
            value={damageItems.length > 0 ? `${damageItems.length} marked area(s)` : "No mapped damage"}
          />
        </div>
        {damageItems.length > 0 ? (
          <ul className={styles.list}>
            {damageItems.map((item) => (
              <li key={`${item.label}-${item.level}`}>
                {item.label} — {item.level}
              </li>
            ))}
          </ul>
        ) : null}
        <p className={styles.description}>{vehicle.description?.trim() || "No description provided yet."}</p>
      </Section>
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

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="admin-detail-title" onClick={onClose}>
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.titleWrap}>
            <span className={styles.eyebrow}>{subtitle}</span>
            <h2 id="admin-detail-title" className={styles.title}>
              {entity.label}
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
          {!loading && !error && payload && entity.kind === "vehicle" ? renderVehicleDetail(payload as VehicleDetailResponse, locale) : null}
        </div>
      </div>
    </div>
  );
}

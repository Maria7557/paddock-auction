"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  BODY_TYPES,
  COLORS,
  CONDITIONS,
  FUEL_TYPES,
  REGION_SPECS,
  SERVICE_HISTORY_OPTIONS,
  TRANSMISSION_TYPES,
  UAE_BRANDS,
  YEARS,
} from "@/src/lib/vehicle_data";

import { type DamageMapValue, DamageDiagram } from "@/components/seller/DamageDiagram";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MULKIYA_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const AIRBAG_OPTIONS = [
  { value: "NO_AIRBAGS", label: "No airbags" },
  { value: "2", label: "2 — Driver + Passenger" },
  { value: "4", label: "4 — Front + Side" },
  { value: "6", label: "6 — Front, Side + Curtain" },
  { value: "8", label: "8 — Full set" },
  { value: "10_PLUS", label: "10+ — Full + Knee airbags" },
  { value: "UNKNOWN", label: "Unknown" },
] as const;

type UploadPhoto = {
  file: File;
  preview: string;
};

type UploadMediaResponse = {
  photos: string[];
  mulkiyaFrontUrl: string;
  mulkiyaBackUrl: string;
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
  startingPriceAed: string;
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
  startingPriceAed: "",
  buyNowPriceAed: "",
  inspectionDropoffDate: "",
};

type VehicleFormProps = {
  initialValues?: Partial<SellerVehicleFormValues>;
  submitLabel: string;
  submittingLabel?: string;
  showAuctionFields?: boolean;
  onSubmit: (values: SellerVehicleFormValues) => Promise<void>;
  onCancel?: () => void;
};

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

function toIsoDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatTimelineDate(value: Date): string {
  return new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function isValidInspectionDate(value: string, tomorrowISO: string, maxDateISO: string): boolean {
  return value >= tomorrowISO && value <= maxDateISO;
}

function validateUploadFile(file: File, allowedTypes: Set<string>): string | null {
  if (!allowedTypes.has(file.type)) {
    return "Invalid file type. Allowed: JPG, PNG (Mulkiya also supports PDF).";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "Each file must be 10MB or less.";
  }

  return null;
}

export function VehicleForm({
  initialValues,
  submitLabel,
  submittingLabel = "Saving...",
  showAuctionFields = true,
  onSubmit,
  onCancel,
}: VehicleFormProps) {
  const [values, setValues] = useState<SellerVehicleFormValues>({
    ...EMPTY_VEHICLE_FORM,
    ...initialValues,
    damageMap: initialValues?.damageMap ?? EMPTY_VEHICLE_FORM.damageMap,
    photoUrls: initialValues?.photoUrls ?? EMPTY_VEHICLE_FORM.photoUrls,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [nhtsaModels, setNhtsaModels] = useState<string[]>([]);
  const [loadingNhtsa, setLoadingNhtsa] = useState(false);
  const [photos, setPhotos] = useState<UploadPhoto[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [mulkiyaFront, setMulkiyaFront] = useState<File | null>(null);
  const [mulkiyaBack, setMulkiyaBack] = useState<File | null>(null);
  const photosRef = useRef<UploadPhoto[]>([]);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const mulkiyaFrontRef = useRef<HTMLInputElement | null>(null);
  const mulkiyaBackRef = useRef<HTMLInputElement | null>(null);

  const uaeBrands = useMemo(() => Object.keys(UAE_BRANDS).map((key) => toBrandLabel(key)), []);

  const matchedUaeBrandKey = useMemo(() => findUaeBrandKey(values.brand), [values.brand]);

  const matchedUaeModels = useMemo(() => {
    if (!matchedUaeBrandKey) {
      return [];
    }

    return UAE_BRANDS[matchedUaeBrandKey] ?? [];
  }, [matchedUaeBrandKey]);

  const tomorrowISO = useMemo(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 1);
    return toIsoDate(date);
  }, []);

  const maxDateISO = useMemo(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 90);
    return toIsoDate(date);
  }, []);

  const selectedDropoffDate = useMemo(() => {
    if (!values.inspectionDropoffDate) {
      return null;
    }

    const date = new Date(`${values.inspectionDropoffDate}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [values.inspectionDropoffDate]);

  const mulkiyaFrontPreview = useMemo(() => {
    if (!mulkiyaFront || mulkiyaFront.type === "application/pdf") {
      return null;
    }

    return URL.createObjectURL(mulkiyaFront);
  }, [mulkiyaFront]);

  const mulkiyaBackPreview = useMemo(() => {
    if (!mulkiyaBack || mulkiyaBack.type === "application/pdf") {
      return null;
    }

    return URL.createObjectURL(mulkiyaBack);
  }, [mulkiyaBack]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) {
        URL.revokeObjectURL(photo.preview);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mulkiyaFrontPreview) {
        URL.revokeObjectURL(mulkiyaFrontPreview);
      }
    };
  }, [mulkiyaFrontPreview]);

  useEffect(() => {
    return () => {
      if (mulkiyaBackPreview) {
        URL.revokeObjectURL(mulkiyaBackPreview);
      }
    };
  }, [mulkiyaBackPreview]);

  function updateField<K extends keyof SellerVehicleFormValues>(key: K, value: SellerVehicleFormValues[K]): void {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function removePhoto(index: number): void {
    setPhotos((previous) => {
      const target = previous[index];

      if (target) {
        URL.revokeObjectURL(target.preview);
      }

      return previous.filter((_, i) => i !== index);
    });
  }

  function addPhotoFiles(fileList: FileList | File[]): void {
    const files = Array.from(fileList);

    if (files.length === 0) {
      return;
    }

    const nextFiles: UploadPhoto[] = [];

    for (const file of files) {
      const validationError = validateUploadFile(file, IMAGE_MIME_TYPES);

      if (validationError) {
        setSubmitError(validationError);
        continue;
      }

      nextFiles.push({
        file,
        preview: URL.createObjectURL(file),
      });
    }

    if (nextFiles.length > 0) {
      setPhotos((previous) => [...previous, ...nextFiles]);
      setSubmitError(null);
    }
  }

  function setMulkiyaFile(side: "front" | "back", file: File | null): void {
    if (!file) {
      if (side === "front") {
        setMulkiyaFront(null);
      } else {
        setMulkiyaBack(null);
      }
      return;
    }

    const validationError = validateUploadFile(file, MULKIYA_MIME_TYPES);

    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    if (side === "front") {
      setMulkiyaFront(file);
    } else {
      setMulkiyaBack(file);
    }

    setSubmitError(null);
  }

  async function fetchNhtsaModels(): Promise<void> {
    if (!values.brand.trim()) {
      setSubmitError("Enter a brand first.");
      return;
    }

    setLoadingNhtsa(true);
    setSubmitError(null);

    try {
      const yearValue = Number(values.year || String(new Date().getUTCFullYear()));
      const response = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformakeyear/make/${encodeURIComponent(values.brand)}/modelyear/${yearValue}?format=json`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch models");
      }

      const payload = (await response.json()) as { Results?: Array<{ Model_Name?: string }> };
      const models = (payload.Results ?? [])
        .map((item) => item.Model_Name?.trim())
        .filter((item): item is string => Boolean(item));

      setNhtsaModels(models);

      if (models.length === 0) {
        setSubmitError("No NHTSA models found. You can still enter a model manually.");
      }
    } catch {
      setSubmitError("Could not fetch NHTSA models.");
      setNhtsaModels([]);
    } finally {
      setLoadingNhtsa(false);
    }
  }

  async function uploadMediaIfNeeded(): Promise<UploadMediaResponse | null> {
    if (!showAuctionFields) {
      return null;
    }

    if (photos.length < 10) {
      throw new Error("Please upload at least 10 photos before submitting.");
    }

    if (!mulkiyaFront || !mulkiyaBack) {
      throw new Error("Please upload both front and back sides of the Mulkiya.");
    }

    const formData = new FormData();

    for (const photo of photos) {
      formData.append("photos", photo.file);
    }

    formData.append("mulkiyaFront", mulkiyaFront);
    formData.append("mulkiyaBack", mulkiyaBack);

    setUploadingMedia(true);

    try {
      const response = await fetch("/api/seller/vehicles/upload-photos", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | UploadMediaResponse
        | { error?: string; message?: string }
        | null;

      if (!response.ok || !payload || !("photos" in payload)) {
        throw new Error(
          (payload as { message?: string; error?: string } | null)?.message ??
            (payload as { message?: string; error?: string } | null)?.error ??
            "Failed to upload media",
        );
      }

      return payload as UploadMediaResponse;
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (showAuctionFields) {
        if (!isValidInspectionDate(values.inspectionDropoffDate, tomorrowISO, maxDateISO)) {
          throw new Error("Inspection drop-off date must be between tomorrow and 90 days from today.");
        }

        const startingPrice = Number(values.startingPriceAed);
        const buyNow = values.buyNowPriceAed ? Number(values.buyNowPriceAed) : null;

        if (buyNow !== null && buyNow <= startingPrice) {
          throw new Error("Buy Now Price must be greater than Starting Price.");
        }
      }

      const uploadResult = await uploadMediaIfNeeded();

      await onSubmit({
        ...values,
        photoUrls: uploadResult?.photos ?? values.photoUrls,
        mulkiyaFrontUrl: uploadResult?.mulkiyaFrontUrl ?? values.mulkiyaFrontUrl,
        mulkiyaBackUrl: uploadResult?.mulkiyaBackUrl ?? values.mulkiyaBackUrl,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save vehicle");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="seller-form-grid" onSubmit={handleSubmit}>
      <label>
        Brand
        <input
          list="seller-vehicle-brands"
          value={values.brand}
          onChange={(event) => {
            updateField("brand", event.target.value);
            updateField("model", "");
            setNhtsaModels([]);
          }}
          placeholder="Toyota"
          required
        />
        <datalist id="seller-vehicle-brands">
          {uaeBrands.map((brand) => (
            <option key={brand} value={brand} />
          ))}
        </datalist>
      </label>

      <label>
        Model
        {matchedUaeModels.length > 0 ? (
          <select value={values.model} onChange={(event) => updateField("model", event.target.value)} required>
            <option value="" disabled>
              Select model
            </option>
            {matchedUaeModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        ) : (
          <>
            <div className="seller-inline-input">
              <input
                value={values.model}
                onChange={(event) => updateField("model", event.target.value)}
                placeholder="Model"
                required
              />
              <button type="button" className="seller-action-btn" onClick={() => void fetchNhtsaModels()}>
                {loadingNhtsa ? "..." : "NHTSA"}
              </button>
            </div>
            {nhtsaModels.length > 0 ? (
              <select value={values.model} onChange={(event) => updateField("model", event.target.value)}>
                <option value="">Select suggested model</option>
                {nhtsaModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        )}
      </label>

      <label>
        Year
        <select value={values.year} onChange={(event) => updateField("year", event.target.value)} required>
          <option value="" disabled>
            Select year
          </option>
          {YEARS.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </label>

      <label>
        VIN
        <input value={values.vin} onChange={(event) => updateField("vin", event.target.value.toUpperCase())} required />
      </label>

      <label>
        Region Spec
        <select value={values.regionSpec} onChange={(event) => updateField("regionSpec", event.target.value)} required>
          <option value="" disabled>
            Select region spec
          </option>
          {REGION_SPECS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label>
        Body Type
        <select value={values.bodyType} onChange={(event) => updateField("bodyType", event.target.value)} required>
          <option value="" disabled>
            Select body type
          </option>
          {BODY_TYPES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label>
        Fuel Type
        <select value={values.fuelType} onChange={(event) => updateField("fuelType", event.target.value)} required>
          <option value="" disabled>
            Select fuel type
          </option>
          {FUEL_TYPES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label>
        Transmission
        <select value={values.transmission} onChange={(event) => updateField("transmission", event.target.value)} required>
          <option value="" disabled>
            Select transmission
          </option>
          {TRANSMISSION_TYPES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label>
        Airbags
        <select value={values.airbags} onChange={(event) => updateField("airbags", event.target.value)} required>
          <option value="" disabled>
            Select airbags
          </option>
          {AIRBAG_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Color
        <select value={values.color} onChange={(event) => updateField("color", event.target.value)} required>
          <option value="" disabled>
            Select color
          </option>
          {COLORS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label>
        Mileage km
        <input
          type="number"
          min={0}
          value={values.mileageKm}
          onChange={(event) => updateField("mileageKm", event.target.value)}
          required
        />
      </label>

      <label>
        Condition
        <select value={values.condition} onChange={(event) => updateField("condition", event.target.value)} required>
          <option value="" disabled>
            Select condition
          </option>
          {CONDITIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label>
        Service History
        <select
          value={values.serviceHistory}
          onChange={(event) => updateField("serviceHistory", event.target.value)}
          required
        >
          <option value="" disabled>
            Select service history
          </option>
          {SERVICE_HISTORY_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label>
        Description
        <textarea
          rows={4}
          value={values.description}
          onChange={(event) => updateField("description", event.target.value)}
          placeholder="Vehicle notes for buyers"
        />
      </label>

      <section className="seller-form-full form-section">
        <h3 className="form-section-title">Damage Report</h3>
        <DamageDiagram
          value={values.damageMap}
          onChange={(next) => {
            updateField("damageMap", next);
          }}
        />
      </section>

      {showAuctionFields ? (
        <>
          <section className="seller-form-full form-section">
            <h3 className="form-section-title">Vehicle Photos</h3>
            <p className="field-hint">
              Upload at least 10 photos. Include exterior (all 4 sides + front/rear), interior, dashboard, engine bay,
              and any damage areas. Accepted: JPG, PNG. Max 10MB per photo.
            </p>

            <div
              className={`photo-upload-zone ${isDragging ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                addPhotoFiles(event.dataTransfer.files);
              }}
              onClick={() => photoInputRef.current?.click()}
            >
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png"
                multiple
                onChange={(event) => {
                  if (event.target.files) {
                    addPhotoFiles(event.target.files);
                  }
                }}
                style={{ display: "none" }}
              />
              <p>
                Drag photos here or <span className="seller-inline-link">click to browse</span>
              </p>
              <p className="field-hint">Minimum 10 photos required</p>
            </div>

            {photos.length > 0 ? (
              <div className="photo-grid">
                {photos.map((photo, index) => (
                  <div key={`${photo.file.name}-${index}`} className="photo-thumb">
                    <img src={photo.preview} alt={`Photo ${index + 1}`} />
                    <button
                      type="button"
                      className="photo-remove"
                      onClick={(event) => {
                        event.stopPropagation();
                        removePhoto(index);
                      }}
                    >
                      ×
                    </button>
                    {index === 0 ? <span className="photo-badge">Cover</span> : null}
                  </div>
                ))}

                <div className="photo-add-more" onClick={() => photoInputRef.current?.click()}>
                  <span className="photo-add-plus">+</span>
                  <span>Add more</span>
                </div>
              </div>
            ) : null}

            <div className="photo-counter">
              <span className={photos.length >= 10 ? "counter-ok" : "counter-warn"}>{photos.length}/10 minimum</span>
              {photos.length >= 10 ? <span className="counter-check">✓ Requirement met</span> : null}
            </div>
          </section>

          <section className="seller-form-full form-section">
            <h3 className="form-section-title">Mulkiya — Vehicle Registration Card</h3>
            <p className="field-hint">
              Upload clear photos of both sides of the Mulkiya (UAE vehicle registration card). This is required to
              verify ownership before the auction is published.
            </p>

            <div className="mulkiya-upload-row">
              <div className="mulkiya-slot">
                <div
                  className={`mulkiya-zone ${mulkiyaFront ? "has-file" : ""}`}
                  onClick={() => mulkiyaFrontRef.current?.click()}
                >
                  <input
                    ref={mulkiyaFrontRef}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(event) => setMulkiyaFile("front", event.target.files?.[0] ?? null)}
                    style={{ display: "none" }}
                  />

                  {mulkiyaFront ? (
                    <>
                      {mulkiyaFront.type === "application/pdf" ? (
                        <span>{mulkiyaFront.name}</span>
                      ) : (
                        <img src={mulkiyaFrontPreview ?? ""} alt="Mulkiya front" />
                      )}
                      <button
                        type="button"
                        className="doc-remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMulkiyaFront(null);
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="mulkiya-icon">ID</span>
                      <span>Front side</span>
                      <span className="field-hint">Click to upload</span>
                    </>
                  )}
                </div>

                <label className="mulkiya-label">
                  {mulkiyaFront ? <span className="ok">✓ Front uploaded</span> : <span className="required">Front side — required</span>}
                </label>
              </div>

              <div className="mulkiya-slot">
                <div
                  className={`mulkiya-zone ${mulkiyaBack ? "has-file" : ""}`}
                  onClick={() => mulkiyaBackRef.current?.click()}
                >
                  <input
                    ref={mulkiyaBackRef}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(event) => setMulkiyaFile("back", event.target.files?.[0] ?? null)}
                    style={{ display: "none" }}
                  />

                  {mulkiyaBack ? (
                    <>
                      {mulkiyaBack.type === "application/pdf" ? (
                        <span>{mulkiyaBack.name}</span>
                      ) : (
                        <img src={mulkiyaBackPreview ?? ""} alt="Mulkiya back" />
                      )}
                      <button
                        type="button"
                        className="doc-remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMulkiyaBack(null);
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="mulkiya-icon">ID</span>
                      <span>Back side</span>
                      <span className="field-hint">Click to upload</span>
                    </>
                  )}
                </div>

                <label className="mulkiya-label">
                  {mulkiyaBack ? <span className="ok">✓ Back uploaded</span> : <span className="required">Back side — required</span>}
                </label>
              </div>
            </div>
          </section>

          <label>
            Starting Price AED
            <input
              type="number"
              min={1}
              step="500"
              value={values.startingPriceAed}
              onChange={(event) => updateField("startingPriceAed", event.target.value)}
              required
            />
          </label>

          <label>
            Buy Now Price AED
            <p className="field-hint">
              If a buyer pays this price, the auction ends immediately and the vehicle is sold.
            </p>
            <input
              type="number"
              min={0}
              step="500"
              value={values.buyNowPriceAed}
              onChange={(event) => updateField("buyNowPriceAed", event.target.value)}
            />
          </label>

          <div className="seller-form-full form-section">
            <label>
              Inspection Drop-off Date
              <p className="field-hint">
                Bring your vehicle to the FleetBid showroom on this date. Buyers can view it in person for 2 days
                before the auction goes live. We will confirm your time slot by email.
              </p>
              <input
                type="date"
                min={tomorrowISO}
                max={maxDateISO}
                value={values.inspectionDropoffDate}
                onChange={(event) => updateField("inspectionDropoffDate", event.target.value)}
                required
              />
            </label>

            {selectedDropoffDate ? (
              <div className="inspection-timeline">
                <div className="timeline-step">
                  <span className="timeline-dot green" />
                  <div>
                    <strong>Drop-off & Inspection</strong>
                    <span>{formatTimelineDate(selectedDropoffDate)}</span>
                  </div>
                </div>
                <div className="timeline-step">
                  <span className="timeline-dot blue" />
                  <div>
                    <strong>Buyer Viewing</strong>
                    <span>
                      {formatTimelineDate(selectedDropoffDate)} – {formatTimelineDate(addDays(selectedDropoffDate, 2))}
                    </span>
                  </div>
                </div>
                <div className="timeline-step">
                  <span className="timeline-dot orange" />
                  <div>
                    <strong>Auction Live</strong>
                    <span>
                      {formatTimelineDate(addDays(selectedDropoffDate, 2))} – {formatTimelineDate(addDays(selectedDropoffDate, 3))}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="seller-form-actions seller-form-full">
        <button type="submit" className="button button-primary" disabled={submitting || uploadingMedia}>
          {submitting || uploadingMedia ? submittingLabel : submitLabel}
        </button>

        {onCancel ? (
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>

      {submitError ? <p className="inline-note tone-error seller-form-full">{submitError}</p> : null}
    </form>
  );
}

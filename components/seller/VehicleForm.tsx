"use client";

import { FormEvent, useMemo, useState } from "react";

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

export type SellerVehicleFormValues = {
  brand: string;
  model: string;
  year: string;
  vin: string;
  regionSpec: string;
  bodyType: string;
  fuelType: string;
  transmission: string;
  color: string;
  mileageKm: string;
  condition: string;
  serviceHistory: string;
  description: string;
  sellerNotes: string;
  startingPriceAed: string;
  reservePriceAed: string;
  startsAt: string;
  endsAt: string;
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
  color: "",
  mileageKm: "",
  condition: "",
  serviceHistory: "",
  description: "",
  sellerNotes: "",
  startingPriceAed: "",
  reservePriceAed: "",
  startsAt: "",
  endsAt: "",
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
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nhtsaModels, setNhtsaModels] = useState<string[]>([]);
  const [loadingNhtsa, setLoadingNhtsa] = useState(false);

  const uaeBrands = useMemo(() => Object.keys(UAE_BRANDS).map((key) => toBrandLabel(key)), []);

  const matchedUaeBrandKey = useMemo(() => findUaeBrandKey(values.brand), [values.brand]);

  const matchedUaeModels = useMemo(() => {
    if (!matchedUaeBrandKey) {
      return [];
    }

    return UAE_BRANDS[matchedUaeBrandKey] ?? [];
  }, [matchedUaeBrandKey]);

  function updateField<K extends keyof SellerVehicleFormValues>(key: K, value: SellerVehicleFormValues[K]): void {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      await onSubmit(values);
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
        Mileage (km)
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

      <label className="seller-form-full">
        Description
        <textarea
          rows={3}
          value={values.description}
          onChange={(event) => updateField("description", event.target.value)}
          placeholder="Vehicle notes for buyers"
        />
      </label>

      <label className="seller-form-full">
        Seller Notes
        <textarea
          rows={3}
          value={values.sellerNotes}
          onChange={(event) => updateField("sellerNotes", event.target.value)}
          placeholder="Internal seller notes"
        />
      </label>

      {showAuctionFields ? (
        <>
          <label>
            Starting Price (AED)
            <input
              type="number"
              min={1}
              step="0.01"
              value={values.startingPriceAed}
              onChange={(event) => updateField("startingPriceAed", event.target.value)}
              required
            />
          </label>

          <label>
            Reserve Price (AED)
            <input
              type="number"
              min={1}
              step="0.01"
              value={values.reservePriceAed}
              onChange={(event) => updateField("reservePriceAed", event.target.value)}
            />
          </label>

          <label>
            Starts At
            <input
              type="datetime-local"
              value={values.startsAt}
              onChange={(event) => updateField("startsAt", event.target.value)}
              required
            />
          </label>

          <label>
            Ends At
            <input
              type="datetime-local"
              value={values.endsAt}
              onChange={(event) => updateField("endsAt", event.target.value)}
              required
            />
          </label>
        </>
      ) : null}

      <div className="seller-form-actions seller-form-full">
        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
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

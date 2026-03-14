"use client";

import { FormEvent, useEffect, useState } from "react";

import { api, getApiErrorMessage } from "@/src/lib/api-client";

type CompanyProfile = {
  companyName: string;
  tradeLicenseNumber: string;
  tradeLicenseExpiry: string;
  vatRegistrationNumber: string;
  operatingRegion: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  logoUrl: string;
  status?: string;
};

const EMPTY_PROFILE: CompanyProfile = {
  companyName: "",
  tradeLicenseNumber: "",
  tradeLicenseExpiry: "",
  vatRegistrationNumber: "",
  operatingRegion: "Dubai",
  addressLine1: "",
  addressLine2: "",
  city: "",
  primaryContactEmail: "",
  primaryContactPhone: "",
  logoUrl: "",
};

export default function SellerSettingsCompanyPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);

  useEffect(() => {
    async function loadProfile(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const payload = await api.seller.company.get<{ profile?: CompanyProfile }>({ cache: "no-store" });

        if (!payload?.profile) {
          throw new Error("Failed to load company profile");
        }

        setProfile(payload.profile);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Unexpected error"));
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await api.seller.company.update(profile);

      setNotice("Company profile saved");
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  async function onLogoChange(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    const asDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("Invalid logo file"));
      };
      reader.onerror = () => reject(new Error("Failed to read logo"));
      reader.readAsDataURL(file);
    });

    setProfile((previous) => ({
      ...previous,
      logoUrl: asDataUrl,
    }));
  }

  if (loading) {
    return <p className="text-muted">Loading company settings...</p>;
  }

  return (
    <section className="surface-panel seller-section-block">
      <h2>Company Profile</h2>
      <p className="text-muted">Manage legal, contact, and branding details.</p>

      <form className="seller-form-grid" onSubmit={onSubmit}>
        <label>
          Company Name
          <input
            value={profile.companyName}
            onChange={(event) => setProfile((previous) => ({ ...previous, companyName: event.target.value }))}
            required
          />
        </label>

        <label>
          Trade License Number
          <input
            value={profile.tradeLicenseNumber}
            onChange={(event) => setProfile((previous) => ({ ...previous, tradeLicenseNumber: event.target.value }))}
            required
          />
        </label>

        <label>
          Trade License Expiry
          <input
            type="date"
            value={profile.tradeLicenseExpiry}
            onChange={(event) => setProfile((previous) => ({ ...previous, tradeLicenseExpiry: event.target.value }))}
          />
        </label>

        <label>
          VAT Registration Number
          <input
            value={profile.vatRegistrationNumber}
            onChange={(event) => setProfile((previous) => ({ ...previous, vatRegistrationNumber: event.target.value }))}
          />
        </label>

        <label>
          Operating Region
          <select
            value={profile.operatingRegion}
            onChange={(event) => setProfile((previous) => ({ ...previous, operatingRegion: event.target.value }))}
            required
          >
            <option value="Dubai">Dubai</option>
            <option value="Abu Dhabi">Abu Dhabi</option>
            <option value="Sharjah">Sharjah</option>
            <option value="Other UAE">Other UAE</option>
          </select>
        </label>

        <label>
          City
          <input value={profile.city} onChange={(event) => setProfile((previous) => ({ ...previous, city: event.target.value }))} />
        </label>

        <label className="seller-form-full">
          Address Line 1
          <input
            value={profile.addressLine1}
            onChange={(event) => setProfile((previous) => ({ ...previous, addressLine1: event.target.value }))}
          />
        </label>

        <label className="seller-form-full">
          Address Line 2
          <input
            value={profile.addressLine2}
            onChange={(event) => setProfile((previous) => ({ ...previous, addressLine2: event.target.value }))}
          />
        </label>

        <label>
          Primary Contact Email
          <input
            type="email"
            value={profile.primaryContactEmail}
            onChange={(event) => setProfile((previous) => ({ ...previous, primaryContactEmail: event.target.value }))}
          />
        </label>

        <label>
          Primary Contact Phone
          <input
            value={profile.primaryContactPhone}
            onChange={(event) => setProfile((previous) => ({ ...previous, primaryContactPhone: event.target.value }))}
          />
        </label>

        <label className="seller-form-full">
          Company Logo
          <div className="seller-logo-row">
            <label className="seller-upload-btn" style={{ width: "fit-content" }}>
              Upload Logo
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  void onLogoChange(event.target.files?.[0] ?? null);
                }}
              />
            </label>
            {profile.logoUrl ? <img src={profile.logoUrl} alt="Company logo" className="seller-logo-preview" /> : null}
          </div>
        </label>

        <div className="seller-form-actions seller-form-full">
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>

      {notice ? <p className="inline-note tone-success">{notice}</p> : null}
      {error ? <p className="inline-note tone-error">{error}</p> : null}
    </section>
  );
}

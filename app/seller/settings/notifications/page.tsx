"use client";

import { FormEvent, useEffect, useState } from "react";

type Preferences = {
  email: {
    auctionStarts: boolean;
    auctionEnds: boolean;
    newBidOnMyLot: boolean;
    auctionWon: boolean;
    paymentReminder: boolean;
  };
  sms: {
    auctionStarts: boolean;
    auctionEnds: boolean;
    newBidOnMyLot: boolean;
    auctionWon: boolean;
    paymentReminder: boolean;
  };
};

const DEFAULT_PREFERENCES: Preferences = {
  email: {
    auctionStarts: true,
    auctionEnds: true,
    newBidOnMyLot: true,
    auctionWon: true,
    paymentReminder: true,
  },
  sms: {
    auctionStarts: false,
    auctionEnds: false,
    newBidOnMyLot: false,
    auctionWon: false,
    paymentReminder: false,
  },
};

const LABELS = [
  { key: "auctionStarts", label: "Auction starts" },
  { key: "auctionEnds", label: "Auction ends" },
  { key: "newBidOnMyLot", label: "New bid on my lot" },
  { key: "auctionWon", label: "Auction won" },
  { key: "paymentReminder", label: "Payment reminder" },
] as const;

export default function SellerSettingsNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    async function loadPreferences(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/seller/notifications-preferences", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { preferences?: Preferences; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? "Failed to load preferences");
        }

        setPreferences(payload?.preferences ?? DEFAULT_PREFERENCES);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unexpected error");
      } finally {
        setLoading(false);
      }
    }

    void loadPreferences();
  }, []);

  function updateChannel(channel: "email" | "sms", key: keyof Preferences["email"], next: boolean): void {
    setPreferences((previous) => ({
      ...previous,
      [channel]: {
        ...previous[channel],
        [key]: next,
      },
    }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/seller/notifications-preferences", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(preferences),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "Failed to save preferences");
      }

      setNotice("Notification preferences saved");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface-panel seller-section-block">
      <h2>Notification Preferences</h2>
      <p className="text-muted">Choose which updates you receive via email and SMS.</p>

      {loading ? <p className="text-muted">Loading preferences...</p> : null}

      {!loading ? (
        <form className="seller-form-grid" onSubmit={onSubmit}>
          <article className="seller-channel-card">
            <h3>Email</h3>
            <div className="seller-toggle-list">
              {LABELS.map((item) => (
                <label key={`email-${item.key}`} className="seller-toggle-row">
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={preferences.email[item.key]}
                    onChange={(event) => updateChannel("email", item.key, event.target.checked)}
                  />
                </label>
              ))}
            </div>
          </article>

          <article className="seller-channel-card">
            <h3>SMS</h3>
            <div className="seller-toggle-list">
              {LABELS.map((item) => (
                <label key={`sms-${item.key}`} className="seller-toggle-row">
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={preferences.sms[item.key]}
                    onChange={(event) => updateChannel("sms", item.key, event.target.checked)}
                  />
                </label>
              ))}
            </div>
          </article>

          <div className="seller-form-actions seller-form-full">
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : null}

      {notice ? <p className="inline-note tone-success">{notice}</p> : null}
      {error ? <p className="inline-note tone-error">{error}</p> : null}
    </section>
  );
}

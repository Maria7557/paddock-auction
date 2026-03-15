"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { AutocompleteField } from "@/components/register/AutocompleteField";
import { api, getApiErrorMessage, getApiErrorPayload } from "@/src/lib/api-client";
import { type LocationCountry } from "@/src/lib/location_directory";
import { LOCATION_COUNTRIES } from "@/src/lib/location_countries";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

import styles from "../register-form.module.css";

export default function SellerRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("United Arab Emirates");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [countries] = useState<LocationCountry[]>(LOCATION_COUNTRIES);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!companyName.trim()) {
      setFeedback("Company name is required.");
      return;
    }

    if (!email.trim()) {
      setFeedback("Email is required.");
      return;
    }

    if (!country.trim()) {
      setFeedback("Country is required.");
      return;
    }

    if (!phoneNumber.trim()) {
      setFeedback("Phone number is required.");
      return;
    }

    if (password !== confirmPassword) {
      setFeedback("Password confirmation does not match.");
      return;
    }

    if (!termsAccepted) {
      setFeedback("You must agree to the Terms and Conditions.");
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const credentials = {
        email,
        password,
      };

      await api.auth.register({
        email: credentials.email,
        password: credentials.password,
        role: "SELLER",
        companyName,
        country,
        phoneNumber,
        termsAccepted,
      });

      const { user } = await api.auth.login(credentials.email, credentials.password);

      if (typeof window !== "undefined") {
        window.localStorage.setItem("fleetbid_role", user.role);
        window.location.href = "/seller/dashboard";
      }
    } catch (error) {
      const payload = getApiErrorPayload<{
        error?: string;
        issues?: Array<{
          path?: string;
          message?: string;
        }>;
      }>(error);

      if (payload?.error === "EMAIL_ALREADY_EXISTS") {
        setFeedback("Email is already registered.");
        return;
      }

      if (payload?.error === "CONFLICT") {
        setFeedback("Email or company account is already registered.");
        return;
      }

      if (payload?.error === "INVALID_REQUEST" && payload.issues?.[0]?.message) {
        setFeedback(payload.issues[0].message);
        return;
      }

      setFeedback(getApiErrorMessage(error, "Registration failed due to network error."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Register Your Company</h1>
          <p>Create your seller account. You will enter the workspace immediately, while publishing stays locked until admin approval.</p>

          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Company name
              <input
                type="text"
                placeholder="FastCars LLC"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                placeholder="ops@company.ae"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <AutocompleteField
              label="Country"
              listId="seller-country-options"
              value={country}
              onChange={setCountry}
              placeholder="Start typing a country"
              helperText="Start typing to search all countries."
              required
            />
            <datalist id="seller-country-options">
              {countries.map((option) => (
                <option key={option.isoCode} value={option.name} />
              ))}
            </datalist>
            <label>
              Phone number
              <input
                type="tel"
                placeholder="+971 50 123 4567"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <label className={styles.termsRow}>
              <input
                className={styles.termsCheckbox}
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                required
              />
              <span>
                I agree to the{" "}
                <button type="button" className={styles.termsLink} onClick={() => setIsTermsOpen(true)}>
                  Terms and Conditions
                </button>
              </span>
            </label>
            <button type="submit" className="button button-primary" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit registration"}
            </button>
          </form>

          {feedback ? <p className="text-muted">{feedback}</p> : null}

          <p className="text-muted">
            Already registered? <Link href="/login/seller">Sign in</Link>
          </p>
        </article>
      </section>

      {isTermsOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="seller-terms-title">
          <div className={styles.modalCard}>
            <h2 id="seller-terms-title">Terms and Conditions</h2>
            <p>FleetBid seller accounts must publish only legitimate fleet inventory, keep vehicle data accurate, and respect auction timelines.</p>
            <p>By continuing, you confirm that your company is authorized to list the vehicles it uploads and that FleetBid may review and approve listings before they go live.</p>
            <div className={styles.modalActions}>
              <button type="button" className="button button-primary" onClick={() => setIsTermsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </MarketShell>
  );
}

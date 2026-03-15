"use client";

import Link from "next/link";
import { useState } from "react";

import { api, getApiErrorMessage, getApiErrorPayload } from "@/src/lib/api-client";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";
import styles from "./page.module.css";

export default function SellerRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [country, setCountry] = useState("UAE");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onSubmit(): Promise<void> {
    if (!companyName.trim()) {
      setFeedback("Company name is required.");
      return;
    }

    if (!email.trim()) {
      setFeedback("Email is required.");
      return;
    }

    if (!registrationNumber.trim()) {
      setFeedback("Registration number is required.");
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
        registrationNumber,
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
        setFeedback("Email or company registration number is already registered.");
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

          <div className="auth-form">
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
            <label>
              Registration number
              <input
                type="text"
                placeholder="AE-12345"
                value={registrationNumber}
                onChange={(event) => setRegistrationNumber(event.target.value)}
                required
              />
            </label>
            <label>
              Country
              <select value={country} onChange={(event) => setCountry(event.target.value)} required>
                <option value="UAE">UAE</option>
                <option value="Saudi Arabia">Saudi Arabia</option>
                <option value="Qatar">Qatar</option>
                <option value="Kuwait">Kuwait</option>
                <option value="Bahrain">Bahrain</option>
                <option value="Oman">Oman</option>
              </select>
            </label>
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
              />{" "}
              I agree to the Terms and Conditions
            </label>
            <button type="button" className="button button-primary" onClick={() => void onSubmit()} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit registration"}
            </button>
          </div>

          {feedback ? <p className="text-muted">{feedback}</p> : null}

          <p className="text-muted">
            Already registered? <Link href="/login/seller">Sign in</Link>
          </p>
        </article>
      </section>
    </MarketShell>
  );
}

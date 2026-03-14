"use client";

import Link from "next/link";
import { useState } from "react";

import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";
import styles from "./page.module.css";

type RegisterResponse = {
  error?: string;
};

export default function SellerRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
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
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          role: "SELLER",
          companyName,
          phoneNumber,
          termsAccepted,
        }),
      });

      const payload = (await response.json().catch(() => null)) as RegisterResponse | null;

      if (!response.ok) {
        if (payload?.error === "EMAIL_ALREADY_EXISTS") {
          setFeedback("Email is already registered.");
          return;
        }

        setFeedback("Registration failed.");
        return;
      }

      setFeedback("Company registered. Pending admin approval.");
      setPassword("");
      setConfirmPassword("");
      setPhoneNumber("");
      setTermsAccepted(false);
    } catch {
      setFeedback("Registration failed due to network error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Register Your Company</h1>
          <p>Create your seller account to manage fleet listings after approval.</p>

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

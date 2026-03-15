"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { api, getApiErrorMessage, getApiErrorPayload } from "@/src/lib/api-client";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default function BuyerRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [country, setCountry] = useState("UAE");
  const [emirate, setEmirate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!companyName.trim()) {
      setFeedback("Company name is required.");
      return;
    }

    if (!registrationNumber.trim()) {
      setFeedback("Registration number is required.");
      return;
    }

    if (password !== confirmPassword) {
      setFeedback("Password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await api.auth.register({
        email,
        password,
        role: "BUYER",
        companyName,
        registrationNumber,
        country,
        emirate,
      });

      setFeedback("Account created. Pending admin approval.");
      setEmail("");
      setCompanyName("");
      setPassword("");
      setConfirmPassword("");
      setRegistrationNumber("");
      setCountry("UAE");
      setEmirate("");
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
          <h1>Register as Buyer</h1>
          <p>Create your account to start bidding after approval.</p>

          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Work email
              <input
                type="email"
                placeholder="buyer@company.ae"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Company name
              <input
                type="text"
                placeholder="Buyer Co LLC"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
              />
            </label>
            <label>
              Registration number
              <input
                type="text"
                placeholder="AE-99999"
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
              Emirate
              <select value={emirate} onChange={(event) => setEmirate(event.target.value)} required>
                <option value="" disabled>
                  Select emirate
                </option>
                <option value="Dubai">Dubai</option>
                <option value="Abu Dhabi">Abu Dhabi</option>
                <option value="Sharjah">Sharjah</option>
                <option value="Ajman">Ajman</option>
                <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                <option value="Fujairah">Fujairah</option>
                <option value="Umm Al Quwain">Umm Al Quwain</option>
                <option value="Other">Other</option>
              </select>
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
            <button type="submit" className="button button-primary" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit registration"}
            </button>
          </form>

          {feedback ? <p className="text-muted">{feedback}</p> : null}

          <p className="text-muted">
            Already registered? <Link href="/login/buyer">Sign in</Link>
          </p>
        </article>
      </section>
    </MarketShell>
  );
}

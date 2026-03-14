"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

type RegisterResponse = {
  error?: string;
};

export default function BuyerRegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emirate, setEmirate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (password !== confirmPassword) {
      setFeedback("Password confirmation does not match.");
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
          role: "BUYER",
          emirate,
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

      setFeedback("Account created. Pending admin approval.");
      setPassword("");
      setConfirmPassword("");
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

"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { api, getApiErrorMessage } from "@/src/lib/api-client";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const { user } = await api.auth.login(email, password);

      window.localStorage.setItem("fleetbid_role", user.role);

      if (user.role === "ADMIN") {
        window.location.href = "/admin";
        return;
      }

      if (user.role === "SELLER") {
        window.location.href = "/seller/dashboard";
        return;
      }

      window.location.href = "/dashboard";
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Login failed due to network error."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Log in</h1>
          <p>Access admin, buyer, or company workspace.</p>

          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Work email
              <input
                type="email"
                placeholder="user@gmail.com"
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
              />
            </label>
            <button type="submit" className="button button-primary" disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Log in"}
            </button>
          </form>

          {feedback ? <p className="text-muted">{feedback}</p> : null}

          <div className="inline-actions auth-panel-actions">
            <Link href="/login/buyer" className="button button-secondary">
              Buyer Login
            </Link>
            <Link href="/login/seller" className="button button-secondary">
              Seller Login
            </Link>
          </div>

          <p className="text-muted auth-forgot-password">
            <Link href="/forgot-password">Forgot password?</Link>
          </p>

          <div className="auth-bottom-cta">
            <Link href="/register" className="button button-secondary btn-full">
              Create an account
            </Link>
          </div>
        </article>
      </section>
    </MarketShell>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

type LoginResponse = {
  token?: string;
  role?: string;
  error?: string;
  status?: string;
};

export default function SellerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok) {
        if (payload?.error === "ACCOUNT_PENDING_APPROVAL") {
          setFeedback("Account is pending admin approval.");
          return;
        }

        setFeedback("Invalid credentials.");
        return;
      }

      if (!payload?.token) {
        setFeedback("Login response did not include token.");
        return;
      }

      if (payload.role !== "SELLER") {
        setFeedback("This login page is for company seller accounts.");
        return;
      }

      window.localStorage.setItem("fleetbid_token", payload.token);
      document.cookie = `token=${payload.token}; Path=/; SameSite=Lax`;
      router.push("/seller/dashboard");
    } catch {
      setFeedback("Login failed due to network error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Company Login</h1>
          <p>Sign in to manage your fleet listings</p>

          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Work email
              <input
                type="email"
                placeholder="ops@company.ae"
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
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {feedback ? <p className="text-muted">{feedback}</p> : null}

          <p className="text-muted">
            <Link href="/register/seller">Register your company</Link>
          </p>
          <p className="text-muted">
            Are you a buyer? <Link href="/login/buyer">Login here</Link>
          </p>
        </article>
      </section>
    </MarketShell>
  );
}

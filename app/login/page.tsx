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

export default function LoginPage() {
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
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok) {
        setFeedback(payload?.error ?? "Invalid credentials.");
        return;
      }

      if (!payload?.token || !payload.role) {
        setFeedback("Login response did not include required session fields.");
        return;
      }

      window.localStorage.setItem("fleetbid_token", payload.token);
      document.cookie = `token=${payload.token}; Path=/; SameSite=Lax`;

      if (payload.role === "ADMIN") {
        router.push("/admin");
        return;
      }

      if (payload.role === "SELLER") {
        router.push("/seller/dashboard");
        return;
      }

      router.push("/dashboard");
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
          <h1>Sign in</h1>
          <p>Access admin, buyer, or company workspace.</p>

          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Work email
              <input
                type="email"
                placeholder="admin@fleetbid.ae"
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

          <div className="inline-actions" style={{ marginTop: "12px" }}>
            <Link href="/login/buyer" className="button button-secondary">
              Buyer Login
            </Link>
            <Link href="/login/seller" className="button button-secondary">
              Company Login
            </Link>
          </div>
        </article>
      </section>
    </MarketShell>
  );
}

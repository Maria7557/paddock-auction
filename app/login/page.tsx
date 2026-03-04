import Link from "next/link";

import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default function LoginPage() {
  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Welcome back</h1>
          <p>Sign in to continue bidding, funding wallet, and paying invoices.</p>

          <form className="auth-form">
            <label>
              Work email
              <input type="email" placeholder="you@company.ae" required />
            </label>
            <label>
              Password
              <input type="password" required />
            </label>
            <button type="submit" className="button button-primary">
              Sign in
            </button>
          </form>

          <p className="text-muted">
            New to Paddock? <Link href="/register">Register company</Link>
          </p>
        </article>
      </section>
    </MarketShell>
  );
}

import Link from "next/link";

import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default function RegisterPage() {
  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Register your company</h1>
          <p>Create a verified buyer account to participate in UAE B2B auctions.</p>

          <form className="auth-form">
            <label>
              Company name
              <input type="text" placeholder="Company LLC" required />
            </label>
            <label>
              Trade license number
              <input type="text" placeholder="TL-XXXXXX" required />
            </label>
            <label>
              Work email
              <input type="email" placeholder="ops@company.ae" required />
            </label>
            <button type="submit" className="button button-primary">
              Submit registration
            </button>
          </form>

          <p className="text-muted">
            Already registered? <Link href="/login">Sign in</Link>
          </p>
        </article>
      </section>
    </MarketShell>
  );
}

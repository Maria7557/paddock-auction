import Link from "next/link";

import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default function LoginPage() {
  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Choose login type</h1>
          <p>Sign in as buyer or company.</p>

          <div className="auth-form">
            <Link href="/login/buyer" className="button button-primary">
              I&apos;m a Buyer
            </Link>
            <Link href="/login/seller" className="button button-secondary">
              I&apos;m a Company
            </Link>
          </div>
        </article>
      </section>
    </MarketShell>
  );
}

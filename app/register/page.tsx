import Link from "next/link";

import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default function RegisterPage() {
  return (
    <MarketShell>
      <section className="auth-layout">
        <article className="surface-panel auth-panel">
          <h1>Choose registration type</h1>
          <p>Create buyer or company account.</p>

          <div className="auth-form">
            <Link href="/register/buyer" className="button button-primary">
              Register as Buyer
            </Link>
            <Link href="/register/seller" className="button button-secondary">
              Register my Company
            </Link>
          </div>
        </article>
      </section>
    </MarketShell>
  );
}

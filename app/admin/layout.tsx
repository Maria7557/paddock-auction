import Link from "next/link";
import { PropsWithChildren } from "react";

export default function AdminLayout({ children }: PropsWithChildren) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <h1>FleetBid Admin</h1>
        <nav>
          <ul>
            <li>
              <Link href="/admin">Dashboard</Link>
            </li>
            <li>
              <Link href="/admin#companies">Companies</Link>
            </li>
            <li>
              <Link href="/admin#users">Users</Link>
            </li>
            <li>
              <Link href="/admin#deposits">Deposits</Link>
            </li>
          </ul>
        </nav>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}

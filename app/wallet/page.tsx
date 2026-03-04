import { readWallet } from "@/src/modules/ui/domain/marketplace_read_model";
import { WalletOverview } from "@/src/modules/ui/transport/components/buyer/wallet_overview";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

export default async function WalletPage() {
  const wallet = await readWallet();

  return (
    <MarketShell>
      <section className="section-block compact">
        <div className="section-heading">
          <h1>Wallet</h1>
          <p>Fund participation, manage locks, and request withdrawals from one place.</p>
        </div>
      </section>

      <WalletOverview wallet={wallet} />
    </MarketShell>
  );
}

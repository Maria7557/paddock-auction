import { BadgeCheck, CheckCircle2, FingerprintPattern } from "lucide-react";

import type { AuctionLot } from "@/src/modules/ui/domain/marketplace_read_model";

type SellerTrustPanelProps = {
  lot: AuctionLot;
};

export function SellerTrustPanel({ lot }: SellerTrustPanelProps) {
  return (
    <section className="surface-panel seller-trust-panel">
      <h2>Seller trust</h2>
      <p className="seller-name">{lot.seller}</p>
      <ul className="seller-trust-list">
        <li className="seller-trust-indicator">
          <BadgeCheck className="structural-icon" size={18} aria-hidden="true" />
          <span>Verified: {lot.sellerVerifiedYears} years</span>
        </li>
        <li className="seller-trust-indicator">
          <CheckCircle2 className="structural-icon" size={18} aria-hidden="true" />
          <span>Completion rate: {lot.sellerCompletionRate}%</span>
        </li>
        <li className="seller-trust-indicator">
          <FingerprintPattern className="structural-icon" size={18} aria-hidden="true" />
          <span>VIN: {lot.vin}</span>
        </li>
      </ul>
    </section>
  );
}

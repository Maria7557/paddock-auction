"use client";

import { useState } from "react";

import {
  type AuctionDocument,
  type AuctionSpec,
  type AuctionBidHistoryEntry,
  formatAed,
  formatShortDateTime,
} from "@/src/modules/ui/domain/marketplace_read_model";

type AuctionDetailTabsProps = {
  specs: AuctionSpec[];
  inspectionSummary: string;
  documents: AuctionDocument[];
  seller: string;
  sellerNotes: string;
  bidHistory: AuctionBidHistoryEntry[];
};

type TabKey = "DETAILS" | "INSPECTION" | "DOCUMENTS" | "SELLER" | "BID_HISTORY";

const TABS: { key: TabKey; label: string }[] = [
  { key: "DETAILS", label: "Details" },
  { key: "INSPECTION", label: "Inspection" },
  { key: "DOCUMENTS", label: "Documents" },
  { key: "SELLER", label: "Seller" },
  { key: "BID_HISTORY", label: "Bid History" },
];

export function AuctionDetailTabs({
  specs,
  inspectionSummary,
  documents,
  seller,
  sellerNotes,
  bidHistory,
}: AuctionDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("DETAILS");

  return (
    <section className="surface-panel detail-tabs-panel">
      <div className="tab-row" role="tablist" aria-label="Auction detail tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={activeTab === tab.key ? "is-active" : undefined}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "DETAILS" ? (
        <div className="tab-content specs-grid">
          {specs.map((spec) => (
            <div key={spec.label}>
              <dt>{spec.label}</dt>
              <dd>{spec.value}</dd>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "INSPECTION" ? (
        <div className="tab-content">
          <p>{inspectionSummary}</p>
        </div>
      ) : null}

      {activeTab === "DOCUMENTS" ? (
        <div className="tab-content">
          <ul className="doc-list">
            {documents.map((document) => (
              <li key={document.id}>
                <span>{document.label}</span>
                <strong>{document.fileType}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activeTab === "SELLER" ? (
        <div className="tab-content">
          <p>
            <strong>{seller}</strong>
          </p>
          <p>{sellerNotes}</p>
        </div>
      ) : null}

      {activeTab === "BID_HISTORY" ? (
        <div className="tab-content">
          <ul className="bid-history-list">
            {bidHistory.map((bid) => (
              <li key={bid.id}>
                <span>#{bid.sequenceNo}</span>
                <span>{bid.bidderAlias}</span>
                <strong>{formatAed(bid.amountAed)}</strong>
                <span>{formatShortDateTime(bid.placedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

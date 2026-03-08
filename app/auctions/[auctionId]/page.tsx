import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { readAuctionDetail } from "@/src/modules/ui/domain/marketplace_read_model";
import { MarketShell } from "@/src/modules/ui/transport/components/shared/market_shell";

import { LiveClient } from "./live-client";

type AuctionDetailPageProps = {
  params: Promise<{ auctionId: string }>;
};

type LiveState = {
  auctionId: string;
  state: "DRAFT" | "SCHEDULED" | "LIVE" | "CLOSED" | "CANCELLED" | "PAYMENT_PENDING";
  currentPrice: number;
  minIncrement: number;
  nextBidAmount: number;
  endsAt: string;
  lastBidder: {
    emirate: string;
    companyName: string;
    amount: number;
    placedAt: string;
  } | null;
  participantsByEmirate: Array<{ emirate: string; count: number }>;
  totalParticipants: number;
  winnerId: string | null;
  isWinner: boolean;
};

function normalizeLotState(state: string): LiveState["state"] {
  const normalized = state.toUpperCase();

  if (normalized === "DRAFT") return "DRAFT";
  if (normalized === "SCHEDULED") return "SCHEDULED";
  if (normalized === "LIVE") return "LIVE";
  if (normalized === "PAYMENT_PENDING") return "PAYMENT_PENDING";
  if (normalized === "CANCELLED") return "CANCELLED";

  return "CLOSED";
}

function pickSpec(specs: Array<{ label: string; value: string }>, candidates: string[]): string | null {
  const candidateSet = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  const match = specs.find((spec) => candidateSet.has(spec.label.toLowerCase()));

  return match?.value ?? null;
}

export default async function AuctionDetailPage({ params }: AuctionDetailPageProps) {
  const { auctionId } = await params;
  const lot = await readAuctionDetail(auctionId);

  if (!lot) {
    notFound();
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const token = headersList.get("authorization") ?? "";

  let initialLiveState: LiveState | null = null;

  try {
    const liveRes = await fetch(`${protocol}://${host}/api/auctions/${auctionId}/live`, {
      headers: token ? { authorization: token } : {},
      cache: "no-store",
    });

    if (liveRes.ok) {
      initialLiveState = (await liveRes.json()) as LiveState;
    }
  } catch {
    // fallback — client will poll
  }

  const vehicle = {
    brand: lot.make ?? lot.title.split(" ")[0] ?? "Unknown",
    model: lot.model ?? lot.title.split(" ").slice(1).join(" ") ?? "Unknown",
    year: lot.year,
    mileage: lot.mileageKm,
    regionSpec: pickSpec(lot.specs, ["Region", "Region Spec", "Spec"]) ?? null,
    fuelType: pickSpec(lot.specs, ["Fuel", "Fuel Type"]) ?? null,
    transmission: pickSpec(lot.specs, ["Transmission"]) ?? null,
    bodyType: pickSpec(lot.specs, ["Body", "Body Type"]) ?? null,
    color: pickSpec(lot.specs, ["Color"]) ?? null,
    condition: pickSpec(lot.specs, ["Condition"]) ?? null,
    description: lot.inspectionSummary ?? null,
    sellerNotes: lot.sellerNotes ?? null,
  };

  const defaultLiveState: LiveState = {
    auctionId,
    state: normalizeLotState(lot.status),
    currentPrice: lot.currentBidAed,
    minIncrement: lot.minimumStepAed,
    nextBidAmount: lot.currentBidAed + lot.minimumStepAed,
    endsAt: lot.endsAt,
    lastBidder: null,
    participantsByEmirate: [],
    totalParticipants: 0,
    winnerId: null,
    isWinner: false,
  };

  return (
    <MarketShell>
      <LiveClient
        auctionId={auctionId}
        vehicle={vehicle}
        images={lot.images ?? []}
        initialState={initialLiveState ?? defaultLiveState}
      />
    </MarketShell>
  );
}

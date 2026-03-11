"use client";

import { useEffect, useState } from "react";

import { LotCard } from "@/components/auction/LotCard";

import { getToken } from "@/src/lib/auth_client";
import { type AuctionLot } from "@/src/modules/ui/domain/marketplace_read_model";

type AuctionLotCardProps = {
  lot: AuctionLot;
};

const SAVED_LOTS_STORAGE_KEY = "fleetbid_saved_lot_ids";

function resolveLotImage(image: string | undefined): string {
  if (!image) {
    return "/vehicle-photo.svg";
  }

  if (image.includes("picsum.photos")) {
    return "/vehicle-photo.svg";
  }

  return image;
}

function readSavedLotIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  const raw = window.localStorage.getItem(SAVED_LOTS_STORAGE_KEY);

  if (!raw) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function writeSavedLotIds(values: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SAVED_LOTS_STORAGE_KEY, JSON.stringify(Array.from(values)));
}

export function AuctionLotCard({ lot }: AuctionLotCardProps) {
  const heroImage = resolveLotImage(lot.images[0]);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsSaved(readSavedLotIds().has(lot.id));
  }, [lot.id]);

  async function onToggleSaved(): Promise<void> {
    const token = getToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    setIsSaving(true);

    try {
      const method = isSaved ? "DELETE" : "POST";
      const response = await fetch(`/api/buyer/wishlist/${lot.id}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        return;
      }

      const nextSaved = !isSaved;
      setIsSaved(nextSaved);

      const savedLotIds = readSavedLotIds();
      if (nextSaved) {
        savedLotIds.add(lot.id);
      } else {
        savedLotIds.delete(lot.id);
      }
      writeSavedLotIds(savedLotIds);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <LotCard
      lotId={lot.id}
      title={lot.title}
      year={lot.year}
      mileage={lot.mileageKm}
      imageUrl={heroImage}
      currentBid={lot.currentBidAed}
      status={lot.status}
      endTime={lot.endsAt}
      actionSlot={
        <button
          type="button"
          onClick={() => void onToggleSaved()}
          className={`lot-wishlist-btn${isSaved ? " is-saved" : ""}`}
          aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"}
          title={isSaved ? "Remove from wishlist" : "Save to wishlist"}
          disabled={isSaving}
        >
          {isSaved ? "♥" : "♡"}
        </button>
      }
    />
  );
}

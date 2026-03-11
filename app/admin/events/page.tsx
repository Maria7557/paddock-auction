import prisma from "@/src/lib/prisma";

import { EventsTable } from "./EventsTable";

type EventState = "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED";

type EventRow = {
  id: string;
  title: string;
  startsAt: string;
  status: EventState;
  lotsCount: number;
};

type EventMeta = {
  title?: string;
  description?: string;
};

function parseMeta(reason: string | null): EventMeta {
  if (!reason) {
    return {};
  }

  try {
    const parsed = JSON.parse(reason) as EventMeta;
    return parsed;
  } catch {
    return {};
  }
}

function normalizeState(state: string): EventState {
  if (state === "DRAFT") {
    return "DRAFT";
  }

  if (state === "SCHEDULED") {
    return "SCHEDULED";
  }

  if (state === "LIVE" || state === "EXTENDED") {
    return "LIVE";
  }

  return "ENDED";
}

async function getEvents(): Promise<EventRow[]> {
  const auctions = await prisma.auction.findMany({
    include: {
      transitions: {
        where: {
          trigger: "EVENT_META",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });

  const groupCounts = new Map<string, number>();

  for (const auction of auctions) {
    const key = `${auction.startsAt.toISOString()}::${auction.endsAt.toISOString()}`;
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }

  return auctions.map((auction) => {
    const meta = parseMeta(auction.transitions[0]?.reason ?? null);
    const key = `${auction.startsAt.toISOString()}::${auction.endsAt.toISOString()}`;

    return {
      id: auction.id,
      title: meta.title?.trim() || `Auction Event ${new Date(auction.startsAt).toLocaleDateString("en-GB")}`,
      startsAt: auction.startsAt.toISOString(),
      status: normalizeState(auction.state),
      lotsCount: groupCounts.get(key) ?? 1,
    };
  });
}

export default async function AdminEventsPage() {
  const events = await getEvents();

  return <EventsTable events={events} />;
}

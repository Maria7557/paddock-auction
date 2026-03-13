import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import { EventsTable } from "./EventsTable";

export const dynamic = "force-dynamic";

type EventState = "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED";

type EventRow = {
  id: string;
  title: string;
  startsAt: string;
  status: EventState;
  lotsCount: number;
};

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
  const payload = await api.admin.events.list<{
    events?: Array<{
      id: string;
      title: string;
      startsAt: string;
      status: string;
      lotsCount: number;
    }>;
  }>(undefined, await withServerCookies({ cache: "no-store" }));

  return (payload.events ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    status: normalizeState(event.status),
    lotsCount: event.lotsCount,
  }));
}

export default async function AdminEventsPage() {
  const events = await getEvents();

  return <EventsTable events={events} />;
}

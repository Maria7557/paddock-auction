import { notFound } from "next/navigation";

import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import { EventResultsClient } from "../EventResultsClient";

export const dynamic = "force-dynamic";

export default async function AdminEventResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const [results, lotsPayload] = await Promise.all([
    api.admin.events.getEventResults(id, requestOptions).catch(() => null),
    api.admin.events.getAdminEventLots(id, requestOptions).catch(() => null),
  ]);

  if (!results || !lotsPayload) {
    notFound();
  }

  return (
    <EventResultsClient
      eventTitle={lotsPayload.event.title}
      scheduledAt={lotsPayload.event.scheduledAt}
      results={results}
    />
  );
}

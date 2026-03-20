import { notFound } from "next/navigation";

import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import { EventLotsClient } from "../EventLotsClient";

export const dynamic = "force-dynamic";

export default async function AdminEventLotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestOptions = await withServerCookies({ cache: "no-store" });
  const payload = await api.admin.events.getAdminEventLots(id, requestOptions).catch(() => null);

  if (!payload) {
    notFound();
  }

  return <EventLotsClient eventId={id} initialData={payload} />;
}

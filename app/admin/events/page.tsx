import { getLocalePreference } from "@/src/lib/display_preferences";
import { api } from "@/src/lib/api-client";
import { withServerCookies } from "@/src/lib/server-api-options";

import { EventsTable } from "./EventsTable";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const locale = await getLocalePreference();
  const events = await api.admin.events.getAdminEvents(await withServerCookies({ cache: "no-store" }));

  return <EventsTable events={events} locale={locale} />;
}

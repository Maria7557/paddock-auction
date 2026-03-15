import { getLocalePreference } from "@/src/lib/display_preferences";

import { NewEventForm } from "./NewEventForm";

export default async function NewEventPage() {
  const locale = await getLocalePreference();

  return <NewEventForm locale={locale} />;
}

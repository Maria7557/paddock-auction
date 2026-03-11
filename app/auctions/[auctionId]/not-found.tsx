import Link from "next/link";

import { withLocalePath } from "@/src/i18n/routing";
import { getPublicDisplaySettings } from "@/src/lib/display_preferences";

export default async function LotNotFound() {
  const display = await getPublicDisplaySettings();
  const isRu = display.locale === "ru";

  return (
    <div
      style={{
        width: "min(520px, calc(100% - 48px))",
        margin: "80px auto",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--ink-primary)" }}>{isRu ? "Лот не найден" : "Lot Not Found"}</h1>
      <p style={{ fontSize: 15, color: "var(--ink-secondary)", lineHeight: 1.6 }}>
        {isRu
          ? "Этот лот мог завершиться, быть снят с торгов или ссылка указана неверно."
          : "This lot may have ended, been removed, or the link might be incorrect."}
      </p>
      <Link href={withLocalePath("/auctions", display.locale)} className="btn btn-primary" style={{ marginTop: 8 }}>
        {isRu ? "Перейти ко всем лотам" : "Browse All Lots"}
      </Link>
    </div>
  );
}

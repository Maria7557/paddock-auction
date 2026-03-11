import { AED_USD_PEG_RATE } from "@/src/lib/money";

export async function getUsdPerAedRate(): Promise<number> {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/AED", {
      next: { revalidate: 60 * 60 },
    });

    if (!response.ok) {
      return AED_USD_PEG_RATE;
    }

    const data = (await response.json()) as { rates?: { USD?: unknown } };

    const usd = Number(data.rates?.USD);

    if (!Number.isFinite(usd) || usd <= 0) {
      return AED_USD_PEG_RATE;
    }

    return usd;
  } catch {
    return AED_USD_PEG_RATE;
  }
}

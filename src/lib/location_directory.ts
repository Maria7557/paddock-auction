export type LocationCountry = {
  name: string;
  isoCode: string;
};

const cityPromises = new Map<string, Promise<string[]>>();
 
async function fetchJson<T>(input: string): Promise<T> {
  const response = await fetch(input, {
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${input}`);
  }

  return (await response.json()) as T;
}
export function findCountryByName(
  countries: LocationCountry[],
  value: string,
): LocationCountry | null {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return countries.find((country) => country.name.trim().toLowerCase() === normalized) ?? null;
}

export async function loadCountryCities(countryCode: string): Promise<string[]> {
  const normalized = countryCode.trim().toUpperCase();

  if (!normalized) {
    return [];
  }

  const cached = cityPromises.get(normalized);

  if (cached) {
    return cached;
  }

  const nextPromise = fetchJson<string[]>(`/location-data/cities/${normalized}.json`).catch(() => []);
  cityPromises.set(normalized, nextPromise);
  return nextPromise;
}

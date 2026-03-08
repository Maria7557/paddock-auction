// UAE top brands with models — static fallback
export const UAE_BRANDS: Record<string, string[]> = {
  Toyota: ["Camry","Corolla","Land Cruiser","Land Cruiser Prado","Hilux","Fortuner","Yaris","RAV4","Avalon","FJ Cruiser","Rush","Innova"],
  Nissan: ["Patrol","Altima","Maxima","Sunny","X-Trail","Qashqai","Navara","Armada","Pathfinder","Murano","Kicks","Juke","Tiida"],
  GMC: ["Yukon","Sierra 1500","Sierra 2500","Terrain","Acadia","Canyon","Envoy","Savana"],
  Ford: ["F-150","F-250","F-350","Explorer","Expedition","Edge","Bronco","Mustang","Ranger","Transit","EcoSport"],
  Chevrolet: ["Tahoe","Suburban","Silverado 1500","Silverado 2500","Traverse","Malibu","Camaro","Corvette","Captiva","Blazer"],
  Dodge: ["Charger","Challenger","Durango","Ram 1500","Ram 2500","Viper"],
  Jeep: ["Grand Cherokee","Grand Cherokee L","Wrangler","Compass","Renegade","Gladiator"],
  Mercedes: ["C 200","C 300","E 200","E 300","E 400","S 500","S 580","GLE 300d","GLE 450","GLC 200","GLC 300","G 500","G 63 AMG","Sprinter","Vito","CLA","A-Class"],
  BMW: ["318i","320i","330i","M3","520i","530i","540i","M5","730Li","750Li","X3","X5","X6","X7","iX","M4"],
  Audi: ["A4","A6","A8","Q3","Q5","Q7","Q8","RS6","RS7","e-tron","e-tron GT","TT"],
  Lexus: ["LX 570","LX 600","GX 460","RX 350","RX 500h","ES 250","ES 350","IS 300","LS 500","LC 500","NX 350"],
  Land_Rover: ["Range Rover","Range Rover Sport","Range Rover Velar","Range Rover Evoque","Discovery","Discovery Sport","Defender 90","Defender 110"],
  Porsche: ["Cayenne","Cayenne GTS","Cayenne Turbo","Macan","Panamera","911 Carrera","911 Turbo","Taycan","718 Boxster"],
  Infiniti: ["QX80","QX60","QX50","Q50","Q60","QX30"],
  Cadillac: ["Escalade","Escalade ESV","XT5","XT6","CT5","CT6"],
  Mitsubishi: ["Pajero","Pajero Sport","Outlander","ASX","Eclipse Cross","L200","Galant"],
  Hyundai: ["Tucson","Santa Fe","Sonata","Elantra","Creta","Palisade","Staria","Ioniq 5","Ioniq 6"],
  Kia: ["Sorento","Sportage","Carnival","Telluride","EV6","Stinger","K5","Seltos","Cerato"],
  Volkswagen: ["Golf","Passat","Tiguan","Touareg","Polo","ID.4","Arteon","Amarok"],
  Honda: ["Accord","Civic","CR-V","Pilot","Odyssey","HR-V","Passport"],
  Maserati: ["Ghibli","Quattroporte","GranTurismo","Levante","MC20"],
  Ferrari: ["488","F8 Tributo","SF90 Stradale","Roma","Portofino","812 Superfast","GTC4Lusso"],
  Lamborghini: ["Urus","Huracán","Aventador","Revuelto"],
  Bentley: ["Bentayga","Continental GT","Flying Spur","Mulsanne"],
  Rolls_Royce: ["Ghost","Phantom","Cullinan","Wraith","Dawn","Spectre"],
};

export const FUEL_TYPES = ["Petrol","Diesel","Electric","Hybrid","Plug-in Hybrid","LPG"] as const;
export const TRANSMISSION_TYPES = ["Automatic","Manual","CVT","Semi-Automatic","Dual-Clutch"] as const;
export const BODY_TYPES = ["Sedan","SUV","Pickup","Van","Coupe","Convertible","Hatchback","Wagon","Minivan","Truck","Crossover"] as const;
export const REGION_SPECS = ["GCC","USA","European","Japanese","Korean","Canadian","Australian","Chinese","Other"] as const;
export const CONDITIONS = ["Excellent","Good","Fair","Poor","Salvage"] as const;
export const COLORS = ["White","Black","Silver","Grey","Blue","Red","Green","Brown","Beige","Gold","Orange","Yellow","Pearl White","Midnight Black","Other"] as const;
export const YEARS = Array.from({ length: 2026 - 1990 + 1 }, (_, i) => 2026 - i);
export const SERVICE_HISTORY_OPTIONS = ["Full Service History","Partial Service History","No Service History","Unknown"] as const;

export type FuelType = typeof FUEL_TYPES[number];
export type TransmissionType = typeof TRANSMISSION_TYPES[number];
export type BodyType = typeof BODY_TYPES[number];
export type RegionSpec = typeof REGION_SPECS[number];
export type Condition = typeof CONDITIONS[number];
export type Color = typeof COLORS[number];

// NHTSA API — fetch all makes dynamically
export async function fetchNhtsaMakes(): Promise<string[]> {
  try {
    const res = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json", { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = await res.json() as { Results: Array<{ Make_Name: string }> };
    return data.Results.map((r) => r.Make_Name);
  } catch {
    return [];
  }
}

export async function fetchNhtsaModels(make: string, year: number): Promise<string[]> {
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformakeyear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data = await res.json() as { Results: Array<{ Model_Name: string }> };
    return data.Results.map((r) => r.Model_Name);
  } catch {
    return [];
  }
}

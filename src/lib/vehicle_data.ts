export const VEHICLE_BRANDS: Record<string, string[]> = {
  Toyota: ["Camry", "Corolla", "Land Cruiser", "Prado", "Hilux", "Fortuner", "Yaris", "RAV4", "Avalon", "FJ Cruiser"],
  Nissan: ["Patrol", "Altima", "Maxima", "Sunny", "X-Trail", "Qashqai", "Navara", "Armada", "Pathfinder", "Murano"],
  Ford: ["F-150", "Explorer", "Expedition", "Edge", "Bronco", "Mustang", "Ranger", "Transit"],
  BMW: ["3 Series", "5 Series", "7 Series", "X3", "X5", "X6", "X7", "M3", "M5"],
  Mercedes: ["C-Class", "E-Class", "S-Class", "GLE", "GLC", "G-Class", "Sprinter", "Vito"],
  Audi: ["A4", "A6", "A8", "Q3", "Q5", "Q7", "Q8", "RS6", "e-tron"],
  Lexus: ["LX", "GX", "RX", "ES", "IS", "LS"],
  Honda: ["Accord", "Civic", "CR-V", "Pilot", "Odyssey"],
  Chevrolet: ["Tahoe", "Suburban", "Silverado", "Traverse", "Malibu", "Camaro", "Corvette"],
  Dodge: ["Charger", "Challenger", "Durango", "Ram 1500"],
  Jeep: ["Grand Cherokee", "Wrangler", "Compass", "Renegade"],
  Land_Rover: ["Range Rover", "Discovery", "Defender", "Evoque", "Velar"],
  Porsche: ["Cayenne", "Macan", "Panamera", "911", "Taycan"],
  Volkswagen: ["Golf", "Passat", "Tiguan", "Touareg", "Polo"],
  Hyundai: ["Tucson", "Santa Fe", "Sonata", "Elantra", "Creta"],
  Kia: ["Sorento", "Sportage", "Carnival", "Telluride", "EV6"],
  Mitsubishi: ["Pajero", "Outlander", "ASX", "Eclipse Cross", "L200"],
  GMC: ["Yukon", "Sierra", "Terrain", "Acadia", "Canyon"],
  Cadillac: ["Escalade", "XT5", "XT6", "CT5", "CT6"],
  Infiniti: ["QX80", "QX60", "QX50", "Q50", "Q60"],
};

export const FUEL_TYPES = ["Petrol", "Diesel", "Electric", "Hybrid", "Plug-in Hybrid"] as const;
export const TRANSMISSION_TYPES = ["Automatic", "Manual", "CVT", "Semi-Automatic"] as const;
export const BODY_TYPES = ["Sedan", "SUV", "Pickup", "Van", "Coupe", "Convertible", "Hatchback", "Wagon", "Minivan"] as const;
export const REGION_SPECS = ["GCC", "USA", "European", "Japanese", "Korean", "Canadian", "Australian", "Other"] as const;
export const CONDITIONS = ["Excellent", "Good", "Fair", "Poor", "Salvage"] as const;
export const COLORS = ["White", "Black", "Silver", "Grey", "Blue", "Red", "Green", "Brown", "Beige", "Gold", "Orange", "Yellow", "Other"] as const;
export const YEARS = Array.from({ length: 2026 - 1990 + 1 }, (_, i) => 2026 - i);

// scripts/seed-demo.ts
// Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-demo.ts
// Seeds: 1 seller company + 1 seller user + 5 vehicles + 5 auctions (2 LIVE, 2 SCHEDULED, 1 DRAFT)

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────
const NOW = new Date();
const h = (n: number) => new Date(NOW.getTime() + n * 3_600_000);
const d = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function dec(n: number) {
  return new Prisma.Decimal(n);
}

// ─── Vehicles (real UAE rental fleet spec) ───────────────────────────────────
const VEHICLES = [
  {
    id: "veh-001",
    brand: "Toyota",
    model: "Land Cruiser GXR",
    year: 2022,
    mileage: 46_210,
    vin: "JTMCB7AJ1N4102451",
    fuelType: "Petrol",
    transmission: "Automatic",
    bodyType: "SUV",
    regionSpec: "GCC",
    condition: "Excellent",
    serviceHistory: "Full dealer service history — Toyota UAE. Last service at 45,000 km.",
    sellerNotes:
      "Fleet retirement unit. One-key. No accidents. Full GCC warranty transferable. " +
      "Original floor mats and spare wheel intact. Ready for immediate transfer.",
  },
  {
    id: "veh-002",
    brand: "BMW",
    model: "X5 M Sport xDrive40i",
    year: 2021,
    mileage: 58_440,
    vin: "WBAJU6107M9C28490",
    fuelType: "Petrol",
    transmission: "Automatic",
    bodyType: "SUV",
    regionSpec: "GCC",
    condition: "Good",
    serviceHistory: "BMW Abu Dhabi dealer service. 3 services on record. No major repairs.",
    sellerNotes:
      "Executive fleet vehicle. M Sport package, panoramic roof, Harman Kardon audio. " +
      "Minor swirl marks on door panels — see inspection report.",
  },
  {
    id: "veh-003",
    brand: "Chevrolet",
    model: "Suburban Premier",
    year: 2022,
    mileage: 71_000,
    vin: "1GNSKKKD9NR230891",
    fuelType: "Petrol",
    transmission: "Automatic",
    bodyType: "SUV",
    regionSpec: "GCC",
    condition: "Good",
    serviceHistory: "Al Ghandi Auto Chevrolet. Full service history. Timing belt replaced at 60k.",
    sellerNotes:
      "Long-wheelbase 8-seater. Chauffeur fleet use. All 3 rows intact. Tow package installed. " +
      "Tyres replaced 15,000 km ago. Export-ready with customs clearance.",
  },
  {
    id: "veh-004",
    brand: "Mercedes-Benz",
    model: "E 300 AMG Line",
    year: 2023,
    mileage: 29_800,
    vin: "WDD2130561A456788",
    fuelType: "Petrol",
    transmission: "Automatic",
    bodyType: "Sedan",
    regionSpec: "GCC",
    condition: "Excellent",
    serviceHistory: "Mercedes-Benz Dubai. 2 services on record. Under original warranty until 2025.",
    sellerNotes:
      "VIP transfer fleet. AMG body kit, Burmester audio, panoramic sunroof. " +
      "Ultra-low mileage for year. First owner. Full service book. Accident-free.",
  },
  {
    id: "veh-005",
    brand: "GMC",
    model: "Yukon Denali",
    year: 2021,
    mileage: 88_200,
    vin: "1GKS2CKJ4MR354021",
    fuelType: "Petrol",
    transmission: "Automatic",
    bodyType: "SUV",
    regionSpec: "North America Spec",
    condition: "Good",
    serviceHistory: "General service every 10k km. Battery replaced 6 months ago.",
    sellerNotes:
      "NA spec — power outlets 110V, heated/cooled seats. Popular for export to GCC. " +
      "Some cosmetic wear on rear bumper. All mechanical systems fully operational.",
  },
];

// ─── Auctions config ─────────────────────────────────────────────────────────
// Format: [vehicleIndex, state, startingPrice, minIncrement, startsAt, endsAt]
type AuctionConfig = [
  number,
  "LIVE" | "SCHEDULED" | "DRAFT",
  number,
  number,
  Date,
  Date,
];

const AUCTION_CONFIGS: AuctionConfig[] = [
  [0, "LIVE",      195_000, 1_000, h(-2),  h(4)],   // Land Cruiser — live now
  [1, "LIVE",      155_000,   750, h(-1),  h(6)],   // BMW X5 — live now
  [2, "SCHEDULED", 110_000,   500, d(1),   d(2)],   // Suburban — tomorrow
  [3, "SCHEDULED", 185_000, 1_000, d(2),   d(3)],   // E-Class — day after
  [4, "DRAFT",      95_000,   500, d(3),   d(4)],   // Yukon — draft (admin to schedule)
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Seeding FleetBid demo data…\n");

  // 1. Default buyer company (needed for buyer registrations)
  const buyerCompany = await prisma.company.upsert({
    where: { registrationNumber: "DEFAULT-BUYER-COMPANY" },
    update: {},
    create: {
      name: "Default Buyer Company",
      country: "AE",
      registrationNumber: "DEFAULT-BUYER-COMPANY",
      status: "ACTIVE",
    },
  });
  console.log("✅ Buyer company:", buyerCompany.id);

  // 2. Seller company
  const company = await prisma.company.upsert({
    where: { registrationNumber: "AE-DXB-EFG-001" },
    update: { status: "ACTIVE" },
    create: {
      name: "Emirates Fleet Group",
      country: "AE",
      registrationNumber: "AE-DXB-EFG-001",
      status: "ACTIVE",
    },
  });
  console.log("✅ Seller company:", company.name, company.id);

  // 3. Seller user
  const sellerHash = await bcrypt.hash("Demo1234!", 12);
  const seller = await prisma.user.upsert({
    where: { email: "seller@emiratesfleet.ae" },
    update: {},
    create: {
      email: "seller@emiratesfleet.ae",
      passwordHash: sellerHash,
      role: "SELLER",
      status: "ACTIVE",
      kycVerified: true,
    },
  });

  // Link seller to company
  const existingLink = await prisma.companyUser.findFirst({
    where: { userId: seller.id, companyId: company.id },
  });
  if (!existingLink) {
    await prisma.companyUser.create({
      data: { userId: seller.id, companyId: company.id, role: "SELLER_MANAGER" },
    });
  }
  console.log("✅ Seller user: seller@emiratesfleet.ae / Demo1234!");

  // 4. Demo buyer user
  const buyerHash = await bcrypt.hash("Demo1234!", 12);
  const buyer = await prisma.user.upsert({
    where: { email: "buyer@demo.ae" },
    update: {},
    create: {
      email: "buyer@demo.ae",
      passwordHash: buyerHash,
      role: "BUYER",
      status: "ACTIVE",
      kycVerified: true,
    },
  });

  // Link buyer to buyer company
  const existingBuyerLink = await prisma.companyUser.findFirst({
    where: { userId: buyer.id, companyId: buyerCompany.id },
  });
  if (!existingBuyerLink) {
    await prisma.companyUser.create({
      data: { userId: buyer.id, companyId: buyerCompany.id, role: "BUYER_BIDDER" },
    });
  }

  // Buyer wallet with 5000 AED deposit
  await prisma.wallet.upsert({
    where: { userId: buyer.id },
    update: {},
    create: {
      userId: buyer.id,
      balance: dec(5000),
      lockedBalance: dec(0),
    },
  });
  console.log("✅ Buyer user: buyer@demo.ae / Demo1234! (wallet: 5,000 AED)");

  // 5. Vehicles
  const createdVehicles: string[] = [];
  for (const v of VEHICLES) {
    const vehicle = await prisma.vehicle.upsert({
      where: { vin: v.vin },
      update: {},
      create: v,
    });
    createdVehicles.push(vehicle.id);
    console.log(`✅ Vehicle: ${v.year} ${v.brand} ${v.model} (${v.vin})`);
  }

  // 6. Auctions
  for (let i = 0; i < AUCTION_CONFIGS.length; i++) {
    const [vIdx, state, startingPrice, minIncrement, startsAt, endsAt] =
      AUCTION_CONFIGS[i];
    const vehicleId = createdVehicles[vIdx];
    const vehicle = VEHICLES[vIdx];

    // Check if auction for this vehicle already exists
    const existing = await prisma.auction.findFirst({
      where: { vehicleId },
    });
    if (existing) {
      console.log(`⏭  Auction for ${vehicle.brand} ${vehicle.model} already exists — skipping`);
      continue;
    }

    const currentPrice =
      state === "LIVE"
        ? startingPrice + minIncrement * Math.floor(Math.random() * 8 + 2)
        : startingPrice;

    const auction = await prisma.auction.create({
      data: {
        id: randomUUID(),
        vehicleId,
        sellerCompanyId: company.id,
        state,
        currentPrice: dec(currentPrice),
        minIncrement: dec(minIncrement),
        startsAt,
        endsAt,
        version: 1,
      },
    });

    // Add a few bids on LIVE auctions
    if (state === "LIVE") {
      let bidPrice = startingPrice;
      for (let b = 0; b < 5; b++) {
        bidPrice += minIncrement * (Math.floor(Math.random() * 3) + 1);
        await prisma.bid.create({
          data: {
            auctionId: auction.id,
            companyId: buyerCompany.id,
            userId: buyer.id,
            amount: dec(bidPrice),
            sequenceNo: b + 1,
          },
        });
      }
    }

    console.log(
      `✅ Auction [${state}]: ${vehicle.year} ${vehicle.brand} ${vehicle.model}` +
        ` — starting AED ${startingPrice.toLocaleString()}` +
        ` | current AED ${currentPrice.toLocaleString()}`
    );
  }

  console.log("\n🎉 Done! Credentials:");
  console.log("   Admin:  admin@fleetbid.ae / Admin1234!");
  console.log("   Seller: seller@emiratesfleet.ae / Demo1234!");
  console.log("   Buyer:  buyer@demo.ae / Demo1234!");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

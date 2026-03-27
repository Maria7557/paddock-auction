import "dotenv/config";

import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, type AuctionState, type VipAccessPolicy } from "@prisma/client";

const prisma = new PrismaClient();

const BUYER_EMAIL = "test@gmail.com";
const BUYER_PASSWORD = "Test1234!";
const BUYER_COMPANY_REGISTRATION = "TEST-GMAIL-VIP-001";
const BUYER_COMPANY_NAME = "Test Gmail VIP Buyer LLC";
const SELLER_COMPANY_REGISTRATION = "PADDOCK-DEV-SELLER-001";
const REQUIRED_BALANCE_AED = 50_000;

const now = new Date();
const hoursFromNow = (hours: number): Date => new Date(now.getTime() + hours * 3_600_000);

function money(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

type DevAuctionFixture = {
  vehicle: {
    vin: string;
    brand: string;
    model: string;
    year: number;
    mileage: number;
    marketPrice: number;
    fuelType: string;
    transmission: string;
    bodyType: string;
    regionSpec: string;
    condition: string;
    engine: string;
    driveType: string;
    exteriorColor: string;
    interiorColor: string;
    airbags: string;
    damage: string;
    serviceHistory: string;
    description: string;
    images: string[];
  };
  auction: {
    id: string;
    state: AuctionState;
    currentPrice: number;
    startingPrice: number;
    minIncrement: number;
    buyNowPrice: number | null;
    startsAt: Date;
    endsAt: Date;
    approvedAt: Date | null;
    vipAccessPolicy: VipAccessPolicy;
    vipReleaseAt: Date | null;
    vipPolicyReason: string | null;
  };
};

const DEV_AUCTIONS: DevAuctionFixture[] = [
  {
    vehicle: {
      vin: "TSTVIP00000000001",
      brand: "Mercedes-Benz",
      model: "G 63 VIP Window",
      year: 2023,
      mileage: 16_400,
      marketPrice: 925_000,
      fuelType: "Petrol",
      transmission: "Automatic",
      bodyType: "SUV",
      regionSpec: "GCC",
      condition: "Excellent",
      engine: "4.0L V8 Twin Turbo",
      driveType: "AWD",
      exteriorColor: "Obsidian Black",
      interiorColor: "Black",
      airbags: "Intact",
      damage: "None",
      serviceHistory: "Dev fixture. Maintained for VIP early access scheduled testing.",
      description: "Scheduled VIP early access lot with Buy Now enabled for buyer flow verification.",
      images: ["/images/car-gwagon.jpg"],
    },
    auction: {
      id: "a8b202de-61b4-44f6-a90e-4b03b4dc2101",
      state: "SCHEDULED",
      currentPrice: 745_000,
      startingPrice: 745_000,
      minIncrement: 5_000,
      buyNowPrice: 812_000,
      startsAt: hoursFromNow(5),
      endsAt: hoursFromNow(29),
      approvedAt: hoursFromNow(-2),
      vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
      vipReleaseAt: hoursFromNow(22),
      vipPolicyReason: "DEV_ACTIVE_SCHEDULED_VIP",
    },
  },
  {
    vehicle: {
      vin: "TSTVIP00000000002",
      brand: "Porsche",
      model: "911 Turbo S Live VIP",
      year: 2022,
      mileage: 21_750,
      marketPrice: 790_000,
      fuelType: "Petrol",
      transmission: "Automatic",
      bodyType: "Coupe",
      regionSpec: "GCC",
      condition: "Excellent",
      engine: "3.8L Flat-6 Twin Turbo",
      driveType: "AWD",
      exteriorColor: "Crayon",
      interiorColor: "Black",
      airbags: "Intact",
      damage: "None",
      serviceHistory: "Dev fixture. Maintained for VIP early access live bidding tests.",
      description: "Live VIP early access lot for bid-path testing.",
      images: ["/images/car-mustang.jpg"],
    },
    auction: {
      id: "da64a191-beb8-4f68-b203-ce94c4fd7102",
      state: "LIVE",
      currentPrice: 668_000,
      startingPrice: 640_000,
      minIncrement: 5_000,
      buyNowPrice: null,
      startsAt: hoursFromNow(-2),
      endsAt: hoursFromNow(6),
      approvedAt: hoursFromNow(-1),
      vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
      vipReleaseAt: hoursFromNow(23),
      vipPolicyReason: "DEV_ACTIVE_LIVE_VIP",
    },
  },
  {
    vehicle: {
      vin: "TSTVIP00000000003",
      brand: "BMW",
      model: "X7 Released Public",
      year: 2023,
      mileage: 31_200,
      marketPrice: 438_000,
      fuelType: "Petrol",
      transmission: "Automatic",
      bodyType: "SUV",
      regionSpec: "GCC",
      condition: "Good",
      engine: "3.0L I6 Turbo",
      driveType: "AWD",
      exteriorColor: "Mineral White",
      interiorColor: "Coffee",
      airbags: "Intact",
      damage: "None",
      serviceHistory: "Dev fixture. Used to verify public access after VIP window expiry.",
      description: "Former VIP early access lot whose release window already expired.",
      images: ["/images/car-bentley.jpg"],
    },
    auction: {
      id: "f3ea833b-d089-4a9a-9aa1-4eb47dd98703",
      state: "SCHEDULED",
      currentPrice: 362_000,
      startingPrice: 350_000,
      minIncrement: 2_500,
      buyNowPrice: 420_000,
      startsAt: hoursFromNow(9),
      endsAt: hoursFromNow(33),
      approvedAt: hoursFromNow(-30),
      vipAccessPolicy: "VIP_EARLY_ACCESS_24H",
      vipReleaseAt: hoursFromNow(-6),
      vipPolicyReason: "DEV_RELEASED_PUBLIC",
    },
  },
  {
    vehicle: {
      vin: "TSTVIP00000000004",
      brand: "Audi",
      model: "RS Q8 Fail Closed",
      year: 2022,
      mileage: 28_900,
      marketPrice: 510_000,
      fuelType: "Petrol",
      transmission: "Automatic",
      bodyType: "SUV",
      regionSpec: "GCC",
      condition: "Excellent",
      engine: "4.0L V8 Twin Turbo",
      driveType: "AWD",
      exteriorColor: "Nardo Gray",
      interiorColor: "Black",
      airbags: "Intact",
      damage: "None",
      serviceHistory: "Dev fixture. Used to verify UNDETERMINED_RESTRICTED behavior.",
      description: "Fail-closed VIP lot for fallback policy testing.",
      images: ["/images/car-mclaren.jpg"],
    },
    auction: {
      id: "0d26cb73-89c0-4601-ae42-27ce8878bf04",
      state: "SCHEDULED",
      currentPrice: 448_000,
      startingPrice: 448_000,
      minIncrement: 3_000,
      buyNowPrice: 489_000,
      startsAt: hoursFromNow(7),
      endsAt: hoursFromNow(31),
      approvedAt: hoursFromNow(-0.5),
      vipAccessPolicy: "UNDETERMINED_RESTRICTED",
      vipReleaseAt: hoursFromNow(23.5),
      vipPolicyReason: "DEV_FAIL_CLOSED",
    },
  },
  {
    vehicle: {
      vin: "TSTVIP00000000005",
      brand: "Toyota",
      model: "Land Cruiser Public",
      year: 2024,
      mileage: 9_800,
      marketPrice: 355_000,
      fuelType: "Petrol",
      transmission: "Automatic",
      bodyType: "SUV",
      regionSpec: "GCC",
      condition: "Excellent",
      engine: "3.5L V6 Twin Turbo",
      driveType: "4WD",
      exteriorColor: "White",
      interiorColor: "Sand",
      airbags: "Intact",
      damage: "None",
      serviceHistory: "Dev fixture. Standard public lot for comparison.",
      description: "Control lot with no VIP restriction.",
      images: ["/images/car-elantra.jpg"],
    },
    auction: {
      id: "beea3818-fef0-41bd-b1dc-41381d9ec005",
      state: "LIVE",
      currentPrice: 319_000,
      startingPrice: 300_000,
      minIncrement: 2_000,
      buyNowPrice: null,
      startsAt: hoursFromNow(-3),
      endsAt: hoursFromNow(5),
      approvedAt: hoursFromNow(-8),
      vipAccessPolicy: "NONE",
      vipReleaseAt: null,
      vipPolicyReason: "DEV_PUBLIC_CONTROL",
    },
  },
];

async function main(): Promise<void> {
  const sellerCompany = await prisma.company.upsert({
    where: {
      registrationNumber: SELLER_COMPANY_REGISTRATION,
    },
    update: {
      status: "ACTIVE",
    },
    create: {
      name: "Paddock Dev Seller LLC",
      country: "AE",
      registrationNumber: SELLER_COMPANY_REGISTRATION,
      status: "ACTIVE",
    },
  });

  const buyerCompany = await prisma.company.upsert({
    where: {
      registrationNumber: BUYER_COMPANY_REGISTRATION,
    },
    update: {
      name: BUYER_COMPANY_NAME,
      country: "AE",
      buyerTier: "VIP",
      status: "ACTIVE",
    },
    create: {
      name: BUYER_COMPANY_NAME,
      country: "AE",
      registrationNumber: BUYER_COMPANY_REGISTRATION,
      buyerTier: "VIP",
      status: "ACTIVE",
    },
  });

  const passwordHash = await bcrypt.hash(BUYER_PASSWORD, 12);
  const buyer = await prisma.user.upsert({
    where: {
      email: BUYER_EMAIL,
    },
    update: {
      passwordHash,
      role: "BUYER",
      status: "ACTIVE",
      kycVerified: true,
    },
    create: {
      email: BUYER_EMAIL,
      passwordHash,
      role: "BUYER",
      status: "ACTIVE",
      kycVerified: true,
    },
  });

  await prisma.companyUser.upsert({
    where: {
      userId_companyId: {
        userId: buyer.id,
        companyId: buyerCompany.id,
      },
    },
    update: {
      role: "BUYER_BIDDER",
    },
    create: {
      userId: buyer.id,
      companyId: buyerCompany.id,
      role: "BUYER_BIDDER",
    },
  });

  await prisma.wallet.upsert({
    where: {
      userId: buyer.id,
    },
    update: {
      balance: money(REQUIRED_BALANCE_AED),
      lockedBalance: money(0),
    },
    create: {
      userId: buyer.id,
      balance: money(REQUIRED_BALANCE_AED),
      lockedBalance: money(0),
    },
  });

  const admin = await prisma.user.findUnique({
    where: {
      email: "admin@fleetbid.ae",
    },
    select: {
      id: true,
    },
  });

  const seededAuctions: Array<{
    auctionId: string;
    vin: string;
    state: AuctionState;
    vipAccessPolicy: VipAccessPolicy;
  }> = [];

  for (const fixture of DEV_AUCTIONS) {
    const vehicle = await prisma.vehicle.upsert({
      where: {
        vin: fixture.vehicle.vin,
      },
      update: {
        brand: fixture.vehicle.brand,
        model: fixture.vehicle.model,
        year: fixture.vehicle.year,
        mileage: fixture.vehicle.mileage,
        marketPrice: money(fixture.vehicle.marketPrice),
        fuelType: fixture.vehicle.fuelType,
        transmission: fixture.vehicle.transmission,
        bodyType: fixture.vehicle.bodyType,
        regionSpec: fixture.vehicle.regionSpec,
        condition: fixture.vehicle.condition,
        serviceHistory: fixture.vehicle.serviceHistory,
        description: fixture.vehicle.description,
        engine: fixture.vehicle.engine,
        driveType: fixture.vehicle.driveType,
        exteriorColor: fixture.vehicle.exteriorColor,
        interiorColor: fixture.vehicle.interiorColor,
        airbags: fixture.vehicle.airbags,
        damage: fixture.vehicle.damage,
        images: fixture.vehicle.images,
      },
      create: {
        vin: fixture.vehicle.vin,
        brand: fixture.vehicle.brand,
        model: fixture.vehicle.model,
        year: fixture.vehicle.year,
        mileage: fixture.vehicle.mileage,
        marketPrice: money(fixture.vehicle.marketPrice),
        fuelType: fixture.vehicle.fuelType,
        transmission: fixture.vehicle.transmission,
        bodyType: fixture.vehicle.bodyType,
        regionSpec: fixture.vehicle.regionSpec,
        condition: fixture.vehicle.condition,
        serviceHistory: fixture.vehicle.serviceHistory,
        description: fixture.vehicle.description,
        engine: fixture.vehicle.engine,
        driveType: fixture.vehicle.driveType,
        exteriorColor: fixture.vehicle.exteriorColor,
        interiorColor: fixture.vehicle.interiorColor,
        airbags: fixture.vehicle.airbags,
        damage: fixture.vehicle.damage,
        images: fixture.vehicle.images,
      },
    });

    await prisma.auction.upsert({
      where: {
        id: fixture.auction.id,
      },
      update: {
        vehicleId: vehicle.id,
        sellerCompanyId: sellerCompany.id,
        state: fixture.auction.state,
        currentPrice: money(fixture.auction.currentPrice),
        startingPrice: money(fixture.auction.startingPrice),
        minIncrement: money(fixture.auction.minIncrement),
        buyNowPrice: fixture.auction.buyNowPrice === null ? null : money(fixture.auction.buyNowPrice),
        startsAt: fixture.auction.startsAt,
        endsAt: fixture.auction.endsAt,
        approvedAt: fixture.auction.approvedAt,
        approvedByUserId: admin?.id ?? null,
        vipAccessPolicy: fixture.auction.vipAccessPolicy,
        vipReleaseAt: fixture.auction.vipReleaseAt,
        vipPolicyReason: fixture.auction.vipPolicyReason,
      },
      create: {
        id: fixture.auction.id,
        vehicleId: vehicle.id,
        sellerCompanyId: sellerCompany.id,
        state: fixture.auction.state,
        currentPrice: money(fixture.auction.currentPrice),
        startingPrice: money(fixture.auction.startingPrice),
        minIncrement: money(fixture.auction.minIncrement),
        buyNowPrice: fixture.auction.buyNowPrice === null ? null : money(fixture.auction.buyNowPrice),
        startsAt: fixture.auction.startsAt,
        endsAt: fixture.auction.endsAt,
        approvedAt: fixture.auction.approvedAt,
        approvedByUserId: admin?.id ?? null,
        vipAccessPolicy: fixture.auction.vipAccessPolicy,
        vipReleaseAt: fixture.auction.vipReleaseAt,
        vipPolicyReason: fixture.auction.vipPolicyReason,
      },
    });

    seededAuctions.push({
      auctionId: fixture.auction.id,
      vin: fixture.vehicle.vin,
      state: fixture.auction.state,
      vipAccessPolicy: fixture.auction.vipAccessPolicy,
    });
  }

  console.log(
    JSON.stringify(
      {
        action: "TEST_VIP_BUYER_SEEDED",
        buyer: {
          email: BUYER_EMAIL,
          password: BUYER_PASSWORD,
          userId: buyer.id,
          companyId: buyerCompany.id,
          companyName: buyerCompany.name,
          buyerTier: buyerCompany.buyerTier,
          walletBalanceAed: REQUIRED_BALANCE_AED,
        },
        sellerCompany: {
          id: sellerCompany.id,
          registrationNumber: sellerCompany.registrationNumber,
        },
        auctions: seededAuctions,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

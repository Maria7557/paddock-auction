import { PrismaClient, AuctionState } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

const NOW = new Date()
const h = (hrs: number) => new Date(NOW.getTime() + hrs * 3_600_000)

async function main() {
  // Get active seller company
  const company = await prisma.company.findFirst({ where: { status: 'ACTIVE' } })
  if (!company) throw new Error('No active company. Run seed-demo.ts first.')
  console.log(`Using company: ${company.name} (${company.id})`)

  // Fix existing broken marketPrice (all = 700000 is wrong)
  await prisma.vehicle.updateMany({
    where: { marketPrice: new Decimal(700000) },
    data: { marketPrice: null }
  })
  console.log('Fixed incorrect marketPrice values on existing vehicles')

  // Fix expired LIVE auctions -> set new dates
  const expiredLive = await prisma.auction.findMany({
    where: { state: 'LIVE', endsAt: { lt: NOW } }
  })
  for (const a of expiredLive) {
    await prisma.auction.update({
      where: { id: a.id },
      data: { startsAt: h(-2), endsAt: h(6) }
    })
    console.log(`Fixed expired LIVE auction ${a.id.slice(0,8)}`)
  }

  // ----------------------------------------------------------------------
  // 30 REAL UAE FLEET VEHICLES
  // Prices sourced from Dubai/Abu Dhabi market (Dubizzle, YallaMotor, CarSwitch)
  // ----------------------------------------------------------------------

  const FLEET: Array<{
    vehicle: Parameters<typeof prisma.vehicle.create>[0]['data']
    auction: {
      currentPrice: number; startingPrice: number; buyNowPrice?: number
      minIncrement: number; state: AuctionState
      startsAt: Date; endsAt: Date
    }
  }> = [

    // -- LIVE: ends in 2-10 hours -----------------------------------------

    {
      vehicle: {
        brand: 'Toyota', model: 'Land Cruiser VXR', year: 2023,
        mileage: 18500, vin: 'JTMHV05J904010001',
        marketPrice: 380000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '5.7L V8', driveType: '4WD', exteriorColor: 'Pearl White',
        interiorColor: 'Beige', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Full dealer service at Al-Futtaim Toyota. All stamps.',
        sellerNotes: 'Single owner. No accidents. Sunroof, parking sensors, 360-cam.',
        description: 'Flagship GCC Toyota Land Cruiser VXR in exceptional condition. Corporate-owned from day one.',
        images: ['/images/car-bentley.jpg'],
      },
      auction: { state: 'LIVE', currentPrice: 312000, startingPrice: 290000,
        buyNowPrice: 365000, minIncrement: 2000, startsAt: h(-3), endsAt: h(2) }
    },

    {
      vehicle: {
        brand: 'Nissan', model: 'Patrol Platinum City', year: 2023,
        mileage: 29000, vin: 'JN8AY2NY4P9010002',
        marketPrice: 285000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '5.6L V8', driveType: '4WD', exteriorColor: 'Midnight Black',
        interiorColor: 'Tan', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al Masaood Automobiles service. 2 services done.',
        sellerNotes: 'Full option. 7-seater. Rear entertainment. Captain seats.',
        description: 'GCC Nissan Patrol Platinum City with full V8 power and luxury appointments.',
        images: ['/images/car-gwagon.jpg'],
      },
      auction: { state: 'LIVE', currentPrice: 228000, startingPrice: 210000,
        buyNowPrice: 272000, minIncrement: 1500, startsAt: h(-4), endsAt: h(4) }
    },

    {
      vehicle: {
        brand: 'Mercedes-Benz', model: 'GLE 53 AMG', year: 2022,
        mileage: 31000, vin: 'WDC0G8EB4NF010003',
        marketPrice: 360000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '3.0L I6 Turbo', driveType: '4MATIC', exteriorColor: 'Graphite Grey',
        interiorColor: 'Black/Red', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Full AMG service history at EMC Dubai.',
        sellerNotes: 'Panoramic roof. Burmester 3D sound. 21" AMG wheels. Night package.',
        description: 'AMG performance SUV with full Mercedes-Benz service history. Ready to drive.',
        images: ['/images/car-mustang.jpg'],
      },
      auction: { state: 'LIVE', currentPrice: 287000, startingPrice: 265000,
        buyNowPrice: 345000, minIncrement: 2000, startsAt: h(-2), endsAt: h(5) }
    },

    {
      vehicle: {
        brand: 'Lexus', model: 'LX 600 VIP', year: 2023,
        mileage: 12000, vin: 'JTJHY7AX4P4010004',
        marketPrice: 480000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '3.5L V6 Twin Turbo', driveType: '4WD', exteriorColor: 'Sonic Titanium',
        interiorColor: 'Saddle Tan', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al-Futtaim Lexus. Warranty valid until 2026.',
        sellerNotes: '4-seat VIP. Rear Ottoman seats. Rear entertainment. 48V mild hybrid.',
        description: 'Ultra-luxury executive Lexus LX 600 VIP spec. Under warranty.',
        images: ['/images/car-elantra.jpg'],
      },
      auction: { state: 'LIVE', currentPrice: 392000, startingPrice: 370000,
        buyNowPrice: 460000, minIncrement: 3000, startsAt: h(-1), endsAt: h(7) }
    },

    {
      vehicle: {
        brand: 'Range Rover', model: 'Sport HSE Dynamic P400', year: 2022,
        mileage: 44000, vin: 'SALWR2RU9NA010005',
        marketPrice: 345000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Good',
        engine: '3.0L I6 MHEV', driveType: 'AWD', exteriorColor: 'Fuji White',
        interiorColor: 'Ebony', airbags: 'Intact', damage: 'Minor scratch rear bumper',
        serviceHistory: 'JLR dealer maintained. 2 services on contract remaining.',
        sellerNotes: 'Meridian audio. Sliding panoramic roof. Black pack exterior.',
        description: 'Sporty Range Rover Sport with JLR full service history.',
        images: ['/images/car-bentley.jpg'],
      },
      auction: { state: 'LIVE', currentPrice: 271000, startingPrice: 255000,
        minIncrement: 2000, startsAt: h(-5), endsAt: h(3) }
    },

    {
      vehicle: {
        brand: 'Ford', model: 'F-150 Raptor R', year: 2023,
        mileage: 19000, vin: '1FTFW1RG4NFA10006',
        marketPrice: 310000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'Pickup', regionSpec: 'USDM', condition: 'Excellent',
        engine: '5.2L Supercharged V8', driveType: '4x4', exteriorColor: 'Avalanche Grey',
        interiorColor: 'Raptor Black', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al Tayer Motors service record. All stamps present.',
        sellerNotes: '700hp V8. Fox Live Valve suspension. 37" BF Goodrich.',
        description: 'Top-spec Raptor R with supercharged V8. Rare in UAE market.',
        images: ['/images/car-mustang.jpg'],
      },
      auction: { state: 'LIVE', currentPrice: 248000, startingPrice: 230000,
        buyNowPrice: 298000, minIncrement: 2000, startsAt: h(-6), endsAt: h(4) }
    },

    {
      vehicle: {
        brand: 'BMW', model: '7 Series 740Li M Sport', year: 2023,
        mileage: 22000, vin: 'WBA7T4C07PCK10007',
        marketPrice: 320000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'Sedan', regionSpec: 'GCC', condition: 'Excellent',
        engine: '3.0L I6 TwinPower Turbo', driveType: 'RWD', exteriorColor: 'Frozen Black',
        interiorColor: 'Tartufo', airbags: 'Intact', damage: 'None',
        serviceHistory: 'AGMC BMW service. Service contract active.',
        sellerNotes: 'Executive Package. Massage front & rear. BMW Theatre Screen.',
        description: 'New-generation BMW 7 Series with Theatre Screen and M Sport package.',
        images: ['/images/car-elantra.jpg'],
      },
      auction: { state: 'LIVE', currentPrice: 258000, startingPrice: 240000,
        buyNowPrice: 308000, minIncrement: 2000, startsAt: h(-3), endsAt: h(6) }
    },

    {
      vehicle: {
        brand: 'Porsche', model: 'Cayenne GTS Coupe', year: 2022,
        mileage: 27000, vin: 'WP1AB2AY7NDA10008',
        marketPrice: 420000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '4.0L V8 Twin Turbo', driveType: 'AWD', exteriorColor: 'Carmine Red',
        interiorColor: 'Black/Red Alcantara', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Porsche Centre Dubai. All stamps in booklet.',
        sellerNotes: 'Sport Chrono. PCCB. BOSE Surround. Rear-axle steering.',
        description: 'Flagship GTS Coupe with V8 performance and rare Carmine Red exterior.',
        images: ['/images/car-gwagon.jpg'],
      },
      auction: { state: 'LIVE', currentPrice: 338000, startingPrice: 315000,
        buyNowPrice: 402000, minIncrement: 3000, startsAt: h(-2), endsAt: h(8) }
    },

    // -- SCHEDULED: starts in 8-72 hours ---------------------------------

    {
      vehicle: {
        brand: 'Toyota', model: 'Camry Grande 3.5', year: 2023,
        mileage: 27000, vin: '4T1BF1FK5NU010009',
        marketPrice: 118000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'Sedan', regionSpec: 'GCC', condition: 'Excellent',
        engine: '3.5L V6', driveType: 'FWD', exteriorColor: 'Super White',
        interiorColor: 'Ivory', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al-Futtaim Toyota service. 2 stamps.',
        sellerNotes: 'Radar cruise. JBL 9-speaker. Wireless CarPlay.',
        description: 'V6 Grande variant - top trim Camry with excellent spec and low km.',
        images: ['/images/car-elantra.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 90000, startingPrice: 90000,
        buyNowPrice: 112000, minIncrement: 1000, startsAt: h(10), endsAt: h(22) }
    },

    {
      vehicle: {
        brand: 'Chevrolet', model: 'Tahoe High Country', year: 2023,
        mileage: 24000, vin: '1GNSCUKD4PR010010',
        marketPrice: 270000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'USDM', condition: 'Good',
        engine: '5.3L V8', driveType: '4WD', exteriorColor: 'Iridescent Pearl',
        interiorColor: 'Jet Black', airbags: 'Intact', damage: 'None',
        serviceHistory: 'General Automotive UAE dealer service.',
        sellerNotes: '8-seater. Sunroof. Power running boards. Bose premium.',
        description: 'High Country top-trim Tahoe. Full-size American SUV with 3-row seating.',
        images: ['/images/car-gwagon.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 210000, startingPrice: 210000,
        buyNowPrice: 258000, minIncrement: 1500, startsAt: h(14), endsAt: h(26) }
    },

    {
      vehicle: {
        brand: 'Audi', model: 'Q8 55 TFSI Quattro S-line', year: 2022,
        mileage: 35000, vin: 'WA1BVAF18ND010011',
        marketPrice: 310000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Good',
        engine: '3.0L V6 TFSI', driveType: 'Quattro AWD', exteriorColor: 'Daytona Grey',
        interiorColor: 'Black Valcona', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Audi Abu Dhabi service. All stamps present.',
        sellerNotes: 'Virtual cockpit Plus. Matrix LED. B&O Sound. S-line exterior.',
        description: 'Flagship Audi Q8 coupe-SUV with full S-line package and B&O audio.',
        images: ['/images/car-mustang.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 248000, startingPrice: 248000,
        buyNowPrice: 298000, minIncrement: 2000, startsAt: h(18), endsAt: h(30) }
    },

    {
      vehicle: {
        brand: 'Cadillac', model: 'Escalade Sport Platinum', year: 2023,
        mileage: 16000, vin: '1GYS4CKL7PR010012',
        marketPrice: 420000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'USDM', condition: 'Excellent',
        engine: '6.2L V8', driveType: '4WD', exteriorColor: 'Black Raven',
        interiorColor: 'Jet Black', airbags: 'Intact', damage: 'None',
        serviceHistory: 'GM Arabia service. Warranty valid until 2026.',
        sellerNotes: 'AKG 36-speaker studio sound. 38" curved OLED. Super Cruise.',
        description: 'Most powerful Escalade variant with the stunning curved OLED interior.',
        images: ['/images/car-bentley.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 345000, startingPrice: 345000,
        buyNowPrice: 400000, minIncrement: 3000, startsAt: h(24), endsAt: h(36) }
    },

    {
      vehicle: {
        brand: 'Hyundai', model: 'Palisade Calligraphy AWD', year: 2023,
        mileage: 19000, vin: 'KM8R4DHE9PU010013',
        marketPrice: 158000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Good',
        engine: '3.8L V6', driveType: 'AWD', exteriorColor: 'Abyss Black',
        interiorColor: 'Nappa Brown', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al Naboodah Hyundai service. 2 services done.',
        sellerNotes: '8-seater. Panoramic dual sunroof. 12.3" dual screen.',
        description: 'Top-of-range Palisade Calligraphy with premium Nappa leather seating.',
        images: ['/images/car-elantra.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 122000, startingPrice: 122000,
        buyNowPrice: 150000, minIncrement: 1000, startsAt: h(28), endsAt: h(40) }
    },

    {
      vehicle: {
        brand: 'Mercedes-Benz', model: 'GLC 300 4MATIC AMG Line', year: 2023,
        mileage: 14000, vin: 'WDC0G4JB4PF010014',
        marketPrice: 240000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '2.0L I4 Turbo', driveType: '4MATIC AWD', exteriorColor: 'Selenite Grey',
        interiorColor: 'Space Grey', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Mercedes-Benz EMC service. Warranty until 2026.',
        sellerNotes: 'AMG Line. Panoramic. Burmester. 9G-Tronic. Digital light.',
        description: 'New-generation GLC 300 with AMG Line aesthetics under warranty.',
        images: ['/images/car-gwagon.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 192000, startingPrice: 192000,
        buyNowPrice: 230000, minIncrement: 1500, startsAt: h(32), endsAt: h(44) }
    },

    {
      vehicle: {
        brand: 'Toyota', model: 'Fortuner 2.8 GR Sport 4x4', year: 2023,
        mileage: 38000, vin: 'MR0FX8CD9P0010015',
        marketPrice: 165000, fuelType: 'Diesel', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Good',
        engine: '2.8L 4-cyl Diesel Turbo', driveType: '4x4', exteriorColor: 'Attitude Black',
        interiorColor: 'Red/Black', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al-Futtaim Toyota. All service stamps present.',
        sellerNotes: 'GR Sport red accents. Bull bar. Off-road tyres.',
        description: 'GR Sport Fortuner with diesel power and full off-road capability.',
        images: ['/images/car-mustang.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 132000, startingPrice: 132000,
        buyNowPrice: 158000, minIncrement: 1000, startsAt: h(36), endsAt: h(48) }
    },

    {
      vehicle: {
        brand: 'Kia', model: 'Telluride SX Prestige', year: 2023,
        mileage: 22000, vin: '5XYP5DHC6PG010016',
        marketPrice: 145000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'USDM', condition: 'Good',
        engine: '3.8L V6', driveType: 'AWD', exteriorColor: 'Everlasting Silver',
        interiorColor: 'Cargo Tan', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Kia dealer maintained. All records available.',
        sellerNotes: '8-seater. BOSE sound. 360-cam. Ventilated seats all rows.',
        description: 'Award-winning Telluride in top Prestige trim with AWD.',
        images: ['/images/car-elantra.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 115000, startingPrice: 115000,
        buyNowPrice: 138000, minIncrement: 1000, startsAt: h(40), endsAt: h(52) }
    },

    {
      vehicle: {
        brand: 'Nissan', model: 'Patrol LE Titanium', year: 2022,
        mileage: 55000, vin: 'JN8AY2NY5N9010017',
        marketPrice: 240000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Good',
        engine: '5.6L V8', driveType: '4WD', exteriorColor: 'Brilliant Silver',
        interiorColor: 'Graphite', airbags: 'Intact', damage: 'Minor rear scuff',
        serviceHistory: 'Al Masaood service history. Last service 8,000 km ago.',
        sellerNotes: 'LE Titanium. BOSE premium. HUD. Captain seats.',
        description: 'Popular GCC Patrol LE with premium Titanium spec.',
        images: ['/images/car-gwagon.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 185000, startingPrice: 185000,
        minIncrement: 1500, startsAt: h(44), endsAt: h(56) }
    },

    {
      vehicle: {
        brand: 'GMC', model: 'Yukon Denali Ultimate', year: 2023,
        mileage: 18000, vin: '1GKS2CKL4PR010018',
        marketPrice: 360000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'USDM', condition: 'Excellent',
        engine: '6.2L V8', driveType: '4WD', exteriorColor: 'White Frost',
        interiorColor: 'Dark Walnut', airbags: 'Intact', damage: 'None',
        serviceHistory: 'GM Arabia dealer. Under factory warranty.',
        sellerNotes: 'Super Cruise. AKG audio. Power side steps. Rear camera mirror.',
        description: 'Range-topping Denali Ultimate. The most luxurious Yukon available.',
        images: ['/images/car-bentley.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 295000, startingPrice: 295000,
        buyNowPrice: 345000, minIncrement: 2500, startsAt: h(50), endsAt: h(62) }
    },

    {
      vehicle: {
        brand: 'Toyota', model: 'Land Cruiser 300 GR Sport', year: 2024,
        mileage: 8000, vin: 'JTMHV05J004010019',
        marketPrice: 420000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '3.5L V6 Twin Turbo', driveType: '4WD', exteriorColor: 'Premium White Pearl',
        interiorColor: 'Black GR Sport', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al-Futtaim Toyota. Under full warranty.',
        sellerNotes: 'GR Sport red accents. E-KDSS. 22" GR wheels. Head-up display.',
        description: 'Rare 2024 LC300 GR Sport under full warranty. Barely used.',
        images: ['/images/car-mustang.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 348000, startingPrice: 348000,
        buyNowPrice: 402000, minIncrement: 3000, startsAt: h(56), endsAt: h(68) }
    },

    {
      vehicle: {
        brand: 'Honda', model: 'Accord Sport 2.0T', year: 2023,
        mileage: 17000, vin: '1HGCV2F39PA010020',
        marketPrice: 108000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'Sedan', regionSpec: 'GCC', condition: 'Excellent',
        engine: '2.0L I4 Turbo VTEC', driveType: 'FWD', exteriorColor: 'Lunar Silver',
        interiorColor: 'Black Sport', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Honda Arabia full dealer service.',
        sellerNotes: 'Sport package. Honda Sensing suite. Wireless CarPlay. Heated seats.',
        description: 'Sporty Accord with turbocharged engine and full Honda Sensing.',
        images: ['/images/car-elantra.jpg'],
      },
      auction: { state: 'SCHEDULED', currentPrice: 82000, startingPrice: 82000,
        buyNowPrice: 102000, minIncrement: 1000, startsAt: h(62), endsAt: h(74) }
    },

    // -- DRAFT: pending admin scheduling ---------------------------------

    {
      vehicle: {
        brand: 'Lamborghini', model: 'Urus S', year: 2023,
        mileage: 9000, vin: 'ZPBUA1ZL4PLA10021',
        marketPrice: 1250000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '4.0L V8 Twin Turbo', driveType: 'AWD', exteriorColor: 'Bianco Monocerus',
        interiorColor: 'Nero Ade', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Lamborghini Dubai. Under 3-year service plan.',
        sellerNotes: 'Pearl white with gloss carbon pack. Akrapovic exhaust option.',
        description: 'S variant Urus with 666hp and full carbon exterior options.',
        images: ['/images/car-bentley.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 1020000, startingPrice: 1020000,
        buyNowPrice: 1200000, minIncrement: 10000, startsAt: h(96), endsAt: h(108) }
    },

    {
      vehicle: {
        brand: 'Bentley', model: 'Bentayga EWB Azure', year: 2023,
        mileage: 5500, vin: 'SCBCU9ZX9PC010022',
        marketPrice: 1550000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '4.0L V8', driveType: 'AWD', exteriorColor: 'Cypress',
        interiorColor: 'Camel Puccini', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Bentley Dubai full service. Under manufacturer warranty.',
        sellerNotes: 'Airline Seat Specification. Massage. Refrigerator. Starlight.',
        description: 'Ultimate luxury SUV in Azure specification. Rear passenger focused.',
        images: ['/images/car-gwagon.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 1250000, startingPrice: 1250000,
        buyNowPrice: 1490000, minIncrement: 15000, startsAt: h(100), endsAt: h(112) }
    },

    {
      vehicle: {
        brand: 'Mercedes-Benz', model: 'S 580 Maybach', year: 2023,
        mileage: 11000, vin: 'WDD2221561A010023',
        marketPrice: 1050000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'Sedan', regionSpec: 'GCC', condition: 'Excellent',
        engine: '4.0L V8 Biturbo', driveType: 'RWD', exteriorColor: 'High-tech Silver/Black',
        interiorColor: 'Nappa Leather Macchiato', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Mercedes-Benz EMC. Warranty valid until 2027.',
        sellerNotes: '4-seat First Class rear. Burmester 4D High-End. Rear folding tables.',
        description: 'Mercedes-Maybach S-Class. The pinnacle of automotive luxury.',
        images: ['/images/car-elantra.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 850000, startingPrice: 850000,
        buyNowPrice: 1010000, minIncrement: 8000, startsAt: h(104), endsAt: h(116) }
    },

    {
      vehicle: {
        brand: 'Tesla', model: 'Model X Plaid', year: 2023,
        mileage: 13000, vin: '5YJXCAE40PF010024',
        marketPrice: 395000, fuelType: 'Electric', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'USDM', condition: 'Excellent',
        engine: 'Tri-Motor Electric 1020hp', driveType: 'AWD', exteriorColor: 'Pearl White Multi-Coat',
        interiorColor: 'White Vegan', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Tesla Service Center Dubai. OTA updates current.',
        sellerNotes: 'Plaid tri-motor. Falcon Wing doors. 17" display. FSD hardware.',
        description: 'Fastest production SUV. 0-100 in 2.6s with Falcon Wing doors.',
        images: ['/images/car-mustang.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 325000, startingPrice: 325000,
        buyNowPrice: 385000, minIncrement: 3000, startsAt: h(120), endsAt: h(132) }
    },

    {
      vehicle: {
        brand: 'Jeep', model: 'Wrangler Rubicon 392', year: 2023,
        mileage: 16000, vin: '1C4HJXFN2PW010025',
        marketPrice: 315000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'USDM', condition: 'Good',
        engine: '6.4L HEMI V8', driveType: '4x4', exteriorColor: 'Hydro Blue',
        interiorColor: 'Black', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al Habtoor Jeep. All service stamps present.',
        sellerNotes: 'V8 470hp. 35" Mud-terrain. Steel bumpers. Warn winch. Sky One-Touch.',
        description: 'Ultimate V8 Wrangler. Built for serious off-road with street presence.',
        images: ['/images/car-gwagon.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 255000, startingPrice: 255000,
        buyNowPrice: 305000, minIncrement: 2500, startsAt: h(124), endsAt: h(136) }
    },

    {
      vehicle: {
        brand: 'Toyota', model: 'Land Cruiser 70 Hard Top V8', year: 2023,
        mileage: 31000, vin: 'JTEBR3FJ9P8010026',
        marketPrice: 205000, fuelType: 'Diesel', transmission: 'Manual',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Good',
        engine: '4.5L V8 Diesel', driveType: '4WD', exteriorColor: 'Sandy Beige',
        interiorColor: 'Grey Fabric', airbags: 'Driver only', damage: 'None',
        serviceHistory: 'Toyota fleet service. All records available.',
        sellerNotes: 'V8 diesel workhorse. ARB steel bumpers. Old Man Emu suspension.',
        description: 'Legendary LC70 V8 diesel. Unbeatable off-road capability.',
        images: ['/images/car-mustang.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 165000, startingPrice: 165000,
        buyNowPrice: 198000, minIncrement: 2000, startsAt: h(128), endsAt: h(140) }
    },

    {
      vehicle: {
        brand: 'Porsche', model: 'Macan S', year: 2023,
        mileage: 21000, vin: 'WP1AB2A52PDA10027',
        marketPrice: 255000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Excellent',
        engine: '2.9L V6 Twin Turbo', driveType: 'AWD', exteriorColor: 'Mamba Green',
        interiorColor: 'Black Alcantara', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Porsche Centre Abu Dhabi. Warranty active.',
        sellerNotes: 'Sport Chrono. PASM. Air suspension. Bose sound. 21" RS Spyder.',
        description: 'Exciting Macan S in rare Mamba Green. Sport Chrono equipped.',
        images: ['/images/car-elantra.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 208000, startingPrice: 208000,
        buyNowPrice: 245000, minIncrement: 2000, startsAt: h(132), endsAt: h(144) }
    },

    {
      vehicle: {
        brand: 'Infiniti', model: 'QX80 Sensory', year: 2022,
        mileage: 48000, vin: 'JN8AZ2NF2N9010028',
        marketPrice: 240000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Good',
        engine: '5.6L V8', driveType: '4WD', exteriorColor: 'Liquid Platinum',
        interiorColor: 'Saddle', airbags: 'Intact', damage: 'None',
        serviceHistory: 'AW Rostamani Infiniti. Service contract ended.',
        sellerNotes: 'Sensory package. 22" forged wheels. 13-speaker Bose.',
        description: 'Full-size Infiniti QX80 with Sensory opulence package.',
        images: ['/images/car-bentley.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 188000, startingPrice: 188000,
        buyNowPrice: 228000, minIncrement: 1500, startsAt: h(136), endsAt: h(148) }
    },

    {
      vehicle: {
        brand: 'Dodge', model: 'RAM 1500 TRX', year: 2023,
        mileage: 14000, vin: '1C6SRFU99PN010029',
        marketPrice: 420000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'Pickup', regionSpec: 'USDM', condition: 'Excellent',
        engine: '6.2L Supercharged HEMI V8 702hp', driveType: '4x4', exteriorColor: 'TRX Red',
        interiorColor: 'Black/Red', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al Habtoor Motors. Under warranty.',
        sellerNotes: '702hp supercharged. 35" Goodyear Wrangler. Level 2 package.',
        description: 'RAM 1500 TRX - the most powerful production pickup in the world.',
        images: ['/images/car-gwagon.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 345000, startingPrice: 345000,
        buyNowPrice: 405000, minIncrement: 3500, startsAt: h(140), endsAt: h(152) }
    },

    {
      vehicle: {
        brand: 'Volkswagen', model: 'Touareg Elegance R-line', year: 2023,
        mileage: 26000, vin: 'WVGZZZ7PZPD010030',
        marketPrice: 195000, fuelType: 'Petrol', transmission: 'Automatic',
        bodyType: 'SUV', regionSpec: 'GCC', condition: 'Good',
        engine: '3.0L V6 TSI', driveType: '4Motion AWD', exteriorColor: 'Platinum Grey',
        interiorColor: 'Espresso Brown', airbags: 'Intact', damage: 'None',
        serviceHistory: 'Al Nabooda VW service. All records present.',
        sellerNotes: 'R-line exterior. Dynaudio premium. Air suspension. Matrix LED.',
        description: 'Understated luxury SUV with European refinement and AWD capability.',
        images: ['/images/car-mustang.jpg'],
      },
      auction: { state: 'DRAFT', currentPrice: 158000, startingPrice: 158000,
        buyNowPrice: 188000, minIncrement: 1500, startsAt: h(144), endsAt: h(156) }
    },
  ]

  // --- INSERT ALL --------------------------------------------------------

  let created = 0
  for (const item of FLEET) {
    try {
      const vehicle = await prisma.vehicle.create({ data: item.vehicle as any })
      await prisma.auction.create({
        data: {
          vehicleId: vehicle.id,
          sellerCompanyId: company.id,
          state: item.auction.state,
          currentPrice: item.auction.currentPrice,
          startingPrice: item.auction.startingPrice,
          buyNowPrice: item.auction.buyNowPrice ?? null,
          minIncrement: item.auction.minIncrement,
          startsAt: item.auction.startsAt,
          endsAt: item.auction.endsAt,
        }
      })
      created++
      console.log(`✓ ${vehicle.brand} ${vehicle.model} ${vehicle.year} [${item.auction.state}]`)
    } catch (err: any) {
      console.error(`✗ ${item.vehicle.brand} ${item.vehicle.model}: ${err.message}`)
    }
  }

  console.log(`\n✅ Done. Created ${created}/30 vehicles with auctions.`)
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

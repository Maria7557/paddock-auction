(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/modules/ui/domain/marketplace_read_model.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Temporary frontend read model for marketplace UX.
// Replace with backend GET read endpoints when those contracts are available.
__turbopack_context__.s([
    "DEFAULT_AUCTION_FILTERS",
    ()=>DEFAULT_AUCTION_FILTERS,
    "describeInvoiceDeadline",
    ()=>describeInvoiceDeadline,
    "filterAndSortAuctions",
    ()=>filterAndSortAuctions,
    "formatAed",
    ()=>formatAed,
    "formatLongDate",
    ()=>formatLongDate,
    "formatShortDateTime",
    ()=>formatShortDateTime,
    "getInvoiceDeadlineTone",
    ()=>getInvoiceDeadlineTone,
    "getStatusLabel",
    ()=>getStatusLabel,
    "readAuctionDetail",
    ()=>readAuctionDetail,
    "readAuctionListing",
    ()=>readAuctionListing,
    "readBidHistory",
    ()=>readBidHistory,
    "readDashboard",
    ()=>readDashboard,
    "readHomepageLots",
    ()=>readHomepageLots,
    "readInvoiceDetail",
    ()=>readInvoiceDetail,
    "readInvoices",
    ()=>readInvoices,
    "readMyBids",
    ()=>readMyBids,
    "readWallet",
    ()=>readWallet,
    "readWatchlist",
    ()=>readWatchlist
]);
const END_AT_BASE = Date.now() + 1000 * 60 * 60 * 7;
const HOUR = 1000 * 60 * 60;
function makeImageSet(seed) {
    const ids = [
        1011,
        1071,
        133,
        1070,
        146,
        180,
        201,
        250,
        287,
        296,
        357,
        463
    ];
    return ids.slice(0, 10).map((id, index)=>{
        const width = 1600;
        const height = 1000;
        return `https://picsum.photos/id/${id + seed + index}/${width}/${height}`;
    });
}
const AUCTIONS = [
    {
        id: "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
        lotNumber: "DXB-1024",
        title: "Toyota Land Cruiser GXR",
        make: "Toyota",
        model: "Land Cruiser GXR",
        year: 2022,
        mileageKm: 46210,
        location: "Dubai Industrial City",
        seller: "Al Noor Fleet Trading",
        sellerVerifiedYears: 6,
        sellerCompletionRate: 98,
        vin: "JTMCB7AJ1N4102451",
        status: "LIVE",
        currentBidAed: 218000,
        minimumStepAed: 1000,
        endsAt: new Date(END_AT_BASE + HOUR * 3).toISOString(),
        startsAt: new Date(Date.now() - HOUR * 6).toISOString(),
        listedAt: new Date(Date.now() - HOUR * 72).toISOString(),
        depositRequiredAed: 5000,
        depositReady: true,
        watchlisted: true,
        images: [
            "/card-lambo-sto.png",
            ...makeImageSet(0)
        ],
        specs: [
            {
                label: "Fuel",
                value: "Petrol"
            },
            {
                label: "Drive",
                value: "AWD"
            },
            {
                label: "Transmission",
                value: "Automatic"
            },
            {
                label: "Color",
                value: "Pearl White"
            },
            {
                label: "Service",
                value: "Dealer serviced"
            },
            {
                label: "Owners",
                value: "1"
            }
        ],
        inspectionSummary: "No structural damage. Full GCC maintenance history attached.",
        sellerNotes: "Fleet retirement unit with complete service records and one-key history.",
        documents: [
            {
                id: "doc-1",
                label: "Inspection report",
                fileType: "PDF"
            },
            {
                id: "doc-2",
                label: "Service records",
                fileType: "ZIP"
            },
            {
                id: "doc-3",
                label: "Ownership scan",
                fileType: "JPG"
            }
        ]
    },
    {
        id: "lot-64e95637-dce9-419a-a08b-2ecf20f8fd20",
        lotNumber: "AUH-2088",
        title: "BMW X5 M Sport",
        make: "BMW",
        model: "X5 M Sport",
        year: 2021,
        mileageKm: 58440,
        location: "Abu Dhabi, Mussafah",
        seller: "Gulf Executive Mobility",
        sellerVerifiedYears: 4,
        sellerCompletionRate: 96,
        vin: "WBAJU6107M9C28490",
        status: "LIVE",
        currentBidAed: 171500,
        minimumStepAed: 750,
        endsAt: new Date(END_AT_BASE + HOUR * 6).toISOString(),
        startsAt: new Date(Date.now() - HOUR * 5).toISOString(),
        listedAt: new Date(Date.now() - HOUR * 48).toISOString(),
        depositRequiredAed: 5000,
        depositReady: true,
        watchlisted: false,
        images: [
            "/card-gwagon.png",
            ...makeImageSet(11)
        ],
        specs: [
            {
                label: "Fuel",
                value: "Hybrid"
            },
            {
                label: "Drive",
                value: "AWD"
            },
            {
                label: "Transmission",
                value: "Automatic"
            },
            {
                label: "Trim",
                value: "M Sport"
            },
            {
                label: "Interior",
                value: "Black leather"
            },
            {
                label: "Owners",
                value: "2"
            }
        ],
        inspectionSummary: "Minor exterior wear. Engine and transmission passed final check.",
        sellerNotes: "Corporate lease return with full service chain and no insurance claim records.",
        documents: [
            {
                id: "doc-4",
                label: "Inspection report",
                fileType: "PDF"
            },
            {
                id: "doc-5",
                label: "Tire report",
                fileType: "PDF"
            },
            {
                id: "doc-6",
                label: "Registration copy",
                fileType: "JPG"
            }
        ]
    },
    {
        id: "lot-3125f011-3f34-4068-b0d7-b7000484baab",
        lotNumber: "DXB-5112",
        title: "Tesla Model Y Long Range",
        make: "Tesla",
        model: "Model Y Long Range",
        year: 2023,
        mileageKm: 22500,
        location: "Dubai, Jebel Ali",
        seller: "Atlas Fleet Hub",
        sellerVerifiedYears: 7,
        sellerCompletionRate: 99,
        vin: "7SAYGDEE3PF451702",
        status: "LIVE",
        currentBidAed: 183000,
        minimumStepAed: 500,
        endsAt: new Date(END_AT_BASE + HOUR * 2).toISOString(),
        startsAt: new Date(Date.now() - HOUR * 8).toISOString(),
        listedAt: new Date(Date.now() - HOUR * 24).toISOString(),
        depositRequiredAed: 5000,
        depositReady: false,
        watchlisted: true,
        images: [
            "/card-bentley-white.png",
            ...makeImageSet(22)
        ],
        specs: [
            {
                label: "Fuel",
                value: "Electric"
            },
            {
                label: "Drive",
                value: "AWD"
            },
            {
                label: "Battery",
                value: "Long Range"
            },
            {
                label: "Autopilot",
                value: "Included"
            },
            {
                label: "Color",
                value: "Midnight Silver"
            },
            {
                label: "Owners",
                value: "1"
            }
        ],
        inspectionSummary: "Battery health report above benchmark. Paint depth consistent all around.",
        sellerNotes: "Single-owner fleet asset with clean charging and maintenance history.",
        documents: [
            {
                id: "doc-7",
                label: "Battery report",
                fileType: "PDF"
            },
            {
                id: "doc-8",
                label: "Inspection photos",
                fileType: "ZIP"
            },
            {
                id: "doc-9",
                label: "Title scan",
                fileType: "JPG"
            }
        ]
    },
    {
        id: "lot-72bb6180-ed27-4f0d-84eb-e6e558f127ba",
        lotNumber: "RAK-7601",
        title: "Nissan Patrol LE Platinum",
        make: "Nissan",
        model: "Patrol LE Platinum",
        year: 2022,
        mileageKm: 38900,
        location: "Ras Al Khaimah",
        seller: "Desert Gate Auto",
        sellerVerifiedYears: 3,
        sellerCompletionRate: 95,
        vin: "JN8AY2NC9N1238901",
        status: "SCHEDULED",
        currentBidAed: 0,
        minimumStepAed: 1000,
        endsAt: new Date(END_AT_BASE + HOUR * 28).toISOString(),
        startsAt: new Date(Date.now() + HOUR * 12).toISOString(),
        listedAt: new Date(Date.now() - HOUR * 12).toISOString(),
        depositRequiredAed: 5000,
        depositReady: true,
        watchlisted: false,
        images: [
            "/card-mustang-red.png",
            ...makeImageSet(33)
        ],
        specs: [
            {
                label: "Fuel",
                value: "Petrol"
            },
            {
                label: "Drive",
                value: "AWD"
            },
            {
                label: "Transmission",
                value: "Automatic"
            },
            {
                label: "Seats",
                value: "7"
            },
            {
                label: "Color",
                value: "Black"
            },
            {
                label: "Owners",
                value: "1"
            }
        ],
        inspectionSummary: "Final inspection approved. Ready for scheduled launch.",
        sellerNotes: "Auction scheduled for tomorrow with reserve already verified.",
        documents: [
            {
                id: "doc-10",
                label: "Pre-sale check",
                fileType: "PDF"
            },
            {
                id: "doc-11",
                label: "Ownership copy",
                fileType: "JPG"
            }
        ]
    },
    {
        id: "lot-d57c4a74-f36c-4cf2-a4f3-6d71055895a8",
        lotNumber: "SHJ-3102",
        title: "Mercedes-Benz E300",
        make: "Mercedes-Benz",
        model: "E300",
        year: 2023,
        mileageKm: 19750,
        location: "Sharjah Auto Zone",
        seller: "Mosaic Dealer Network",
        sellerVerifiedYears: 5,
        sellerCompletionRate: 97,
        vin: "W1KZF8DB6PA120112",
        status: "PAYMENT_PENDING",
        currentBidAed: 198000,
        minimumStepAed: 1000,
        endsAt: new Date(Date.now() - HOUR * 56).toISOString(),
        startsAt: new Date(Date.now() - HOUR * 108).toISOString(),
        listedAt: new Date(Date.now() - HOUR * 144).toISOString(),
        depositRequiredAed: 5000,
        depositReady: true,
        watchlisted: false,
        images: [
            "/card-lambo-orange.png",
            ...makeImageSet(44)
        ],
        specs: [
            {
                label: "Fuel",
                value: "Petrol"
            },
            {
                label: "Drive",
                value: "RWD"
            },
            {
                label: "Transmission",
                value: "Automatic"
            },
            {
                label: "Trim",
                value: "AMG package"
            },
            {
                label: "Color",
                value: "Obsidian Black"
            },
            {
                label: "Owners",
                value: "1"
            }
        ],
        inspectionSummary: "Auction closed. Winner invoice issued and payment window is active.",
        sellerNotes: "Settlement pending winner payment within policy window.",
        documents: [
            {
                id: "doc-12",
                label: "Inspection report",
                fileType: "PDF"
            },
            {
                id: "doc-13",
                label: "Service report",
                fileType: "PDF"
            }
        ]
    },
    {
        id: "lot-a2a8d6e6-fab9-486b-bfa3-bbf88ba44b2f",
        lotNumber: "AUH-3180",
        title: "Lexus LX600 Prestige",
        make: "Lexus",
        model: "LX600 Prestige",
        year: 2024,
        mileageKm: 12600,
        location: "Abu Dhabi Industrial Area",
        seller: "Pearl Motors Contracting",
        sellerVerifiedYears: 9,
        sellerCompletionRate: 99,
        vin: "JTJHY7AX3R1233180",
        status: "PAYMENT_PENDING",
        currentBidAed: 355000,
        minimumStepAed: 1500,
        endsAt: new Date(Date.now() - HOUR * 22).toISOString(),
        startsAt: new Date(Date.now() - HOUR * 70).toISOString(),
        listedAt: new Date(Date.now() - HOUR * 120).toISOString(),
        depositRequiredAed: 5000,
        depositReady: true,
        watchlisted: true,
        images: makeImageSet(55),
        specs: [
            {
                label: "Fuel",
                value: "Petrol"
            },
            {
                label: "Drive",
                value: "AWD"
            },
            {
                label: "Transmission",
                value: "Automatic"
            },
            {
                label: "Interior",
                value: "Tan leather"
            },
            {
                label: "Color",
                value: "Platinum Pearl"
            },
            {
                label: "Owners",
                value: "1"
            }
        ],
        inspectionSummary: "Final bidder confirmed. Awaiting settlement payment.",
        sellerNotes: "Priority settlement lot with standard 48h payment deadline.",
        documents: [
            {
                id: "doc-14",
                label: "Inspection report",
                fileType: "PDF"
            },
            {
                id: "doc-15",
                label: "VIN decode",
                fileType: "PDF"
            },
            {
                id: "doc-16",
                label: "Ownership copy",
                fileType: "JPG"
            }
        ]
    },
    {
        id: "lot-80dce53d-e289-42dc-b966-28600ec89b06",
        lotNumber: "DXB-4050",
        title: "Audi Q7 S line",
        make: "Audi",
        model: "Q7 S line",
        year: 2020,
        mileageKm: 79500,
        location: "Dubai Al Quoz",
        seller: "Prime Mobility Holdings",
        sellerVerifiedYears: 5,
        sellerCompletionRate: 94,
        vin: "WA1VAAF76LD015050",
        status: "ENDED",
        currentBidAed: 132000,
        minimumStepAed: 750,
        endsAt: new Date(Date.now() - HOUR * 124).toISOString(),
        startsAt: new Date(Date.now() - HOUR * 170).toISOString(),
        listedAt: new Date(Date.now() - HOUR * 210).toISOString(),
        depositRequiredAed: 5000,
        depositReady: true,
        watchlisted: false,
        images: makeImageSet(66),
        specs: [
            {
                label: "Fuel",
                value: "Diesel"
            },
            {
                label: "Drive",
                value: "AWD"
            },
            {
                label: "Transmission",
                value: "Automatic"
            },
            {
                label: "Trim",
                value: "S line"
            },
            {
                label: "Color",
                value: "Graphite"
            },
            {
                label: "Owners",
                value: "2"
            }
        ],
        inspectionSummary: "Closed successfully. Settlement completed.",
        sellerNotes: "Historical completed lot retained for market comps.",
        documents: [
            {
                id: "doc-17",
                label: "Final report",
                fileType: "PDF"
            }
        ]
    },
    {
        id: "lot-0c2979bc-401e-43b0-acf1-c214f8474e9b",
        lotNumber: "FUJ-4222",
        title: "Range Rover Sport HSE",
        make: "Land Rover",
        model: "Range Rover Sport HSE",
        year: 2021,
        mileageKm: 51240,
        location: "Fujairah Logistics Zone",
        seller: "Northern Premier Autos",
        sellerVerifiedYears: 2,
        sellerCompletionRate: 91,
        vin: "SALWA2BE8MA142228",
        status: "DEFAULTED",
        currentBidAed: 161000,
        minimumStepAed: 1000,
        endsAt: new Date(Date.now() - HOUR * 72).toISOString(),
        startsAt: new Date(Date.now() - HOUR * 130).toISOString(),
        listedAt: new Date(Date.now() - HOUR * 180).toISOString(),
        depositRequiredAed: 5000,
        depositReady: true,
        watchlisted: false,
        images: makeImageSet(77),
        specs: [
            {
                label: "Fuel",
                value: "Hybrid"
            },
            {
                label: "Drive",
                value: "AWD"
            },
            {
                label: "Transmission",
                value: "Automatic"
            },
            {
                label: "Color",
                value: "Santorini Black"
            },
            {
                label: "Interior",
                value: "Ebony"
            },
            {
                label: "Owners",
                value: "2"
            }
        ],
        inspectionSummary: "Winner defaulted under payment policy. Lot ready for relist workflow.",
        sellerNotes: "Collateral burn policy already applied by backend.",
        documents: [
            {
                id: "doc-18",
                label: "Default memo",
                fileType: "PDF"
            }
        ]
    }
];
const BID_HISTORY_BY_AUCTION_ID = {
    "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0": [
        {
            id: "bid-9082",
            auctionId: "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
            bidderAlias: "ALN-FLEET",
            amountAed: 218000,
            placedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
            sequenceNo: 27,
            isMine: true
        },
        {
            id: "bid-9081",
            auctionId: "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
            bidderAlias: "ZEN-LEASE",
            amountAed: 217000,
            placedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
            sequenceNo: 26
        },
        {
            id: "bid-9080",
            auctionId: "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
            bidderAlias: "MOTIVE-TRD",
            amountAed: 216000,
            placedAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
            sequenceNo: 25
        }
    ],
    "lot-64e95637-dce9-419a-a08b-2ecf20f8fd20": [
        {
            id: "bid-7502",
            auctionId: "lot-64e95637-dce9-419a-a08b-2ecf20f8fd20",
            bidderAlias: "GULF-AUTO",
            amountAed: 171500,
            placedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
            sequenceNo: 18
        },
        {
            id: "bid-7501",
            auctionId: "lot-64e95637-dce9-419a-a08b-2ecf20f8fd20",
            bidderAlias: "KITE-CARS",
            amountAed: 170750,
            placedAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
            sequenceNo: 17,
            isMine: true
        }
    ],
    "lot-3125f011-3f34-4068-b0d7-b7000484baab": [
        {
            id: "bid-2202",
            auctionId: "lot-3125f011-3f34-4068-b0d7-b7000484baab",
            bidderAlias: "ATLAS-RAC",
            amountAed: 183000,
            placedAt: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
            sequenceNo: 32
        },
        {
            id: "bid-2201",
            auctionId: "lot-3125f011-3f34-4068-b0d7-b7000484baab",
            bidderAlias: "FASTMILES",
            amountAed: 182500,
            placedAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
            sequenceNo: 31,
            isMine: true
        }
    ]
};
const WALLET = {
    availableBalanceAed: 18500,
    lockedBalanceAed: 10000,
    pendingWithdrawalAed: 2500,
    activeLocks: [
        {
            lockId: "lock-live-1024",
            auctionId: "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
            lotNumber: "DXB-1024",
            amountAed: 5000,
            status: "ACTIVE"
        },
        {
            lockId: "lock-live-5112",
            auctionId: "lot-3125f011-3f34-4068-b0d7-b7000484baab",
            lotNumber: "DXB-5112",
            amountAed: 5000,
            status: "ACTIVE"
        }
    ],
    transactions: [
        {
            id: "txn-1",
            type: "TOP_UP",
            amountAed: 20000,
            createdAt: new Date(Date.now() - HOUR * 120).toISOString(),
            note: "Corporate wallet funding"
        },
        {
            id: "txn-2",
            type: "LOCK_ACQUIRE",
            amountAed: -5000,
            createdAt: new Date(Date.now() - HOUR * 8).toISOString(),
            note: "Deposit lock for DXB-1024"
        },
        {
            id: "txn-3",
            type: "LOCK_ACQUIRE",
            amountAed: -5000,
            createdAt: new Date(Date.now() - HOUR * 5).toISOString(),
            note: "Deposit lock for DXB-5112"
        },
        {
            id: "txn-4",
            type: "WITHDRAWAL",
            amountAed: -2500,
            createdAt: new Date(Date.now() - HOUR * 24).toISOString(),
            note: "Pending withdrawal request"
        }
    ]
};
const INVOICES = [
    {
        id: "inv-d57c4a74-f36c",
        auctionId: "lot-d57c4a74-f36c-4cf2-a4f3-6d71055895a8",
        lotNumber: "SHJ-3102",
        lotTitle: "Mercedes-Benz E300",
        winnerCompany: "Al Noor Fleet Trading",
        winningAmountAed: 198000,
        commissionAed: 5940,
        vatAed: 10197,
        totalAed: 214137,
        issuedAt: new Date(Date.now() - HOUR * 22).toISOString(),
        dueAt: new Date(Date.now() + HOUR * 18).toISOString(),
        status: "ISSUED",
        stripePaymentIntentId: null
    },
    {
        id: "inv-a2a8d6e6-fab9",
        auctionId: "lot-a2a8d6e6-fab9-486b-bfa3-bbf88ba44b2f",
        lotNumber: "AUH-3180",
        lotTitle: "Lexus LX600 Prestige",
        winnerCompany: "Gulf Executive Mobility",
        winningAmountAed: 355000,
        commissionAed: 10650,
        vatAed: 18282,
        totalAed: 383932,
        issuedAt: new Date(Date.now() - HOUR * 10).toISOString(),
        dueAt: new Date(Date.now() + HOUR * 36).toISOString(),
        status: "ISSUED",
        stripePaymentIntentId: "pi_3R6DbfG3k89fdemo"
    },
    {
        id: "inv-defaulted-4222",
        auctionId: "lot-0c2979bc-401e-43b0-acf1-c214f8474e9b",
        lotNumber: "FUJ-4222",
        lotTitle: "Range Rover Sport HSE",
        winnerCompany: "Atlas Fleet Hub",
        winningAmountAed: 161000,
        commissionAed: 4830,
        vatAed: 8283,
        totalAed: 174113,
        issuedAt: new Date(Date.now() - HOUR * 72).toISOString(),
        dueAt: new Date(Date.now() - HOUR * 20).toISOString(),
        status: "DEFAULTED",
        stripePaymentIntentId: "pi_defaulted_4222"
    }
];
const MY_BIDS = [
    {
        id: "mb-1",
        auctionId: "lot-8d807f7f-f6f7-4b26-b332-7c7266cf57e0",
        lotNumber: "DXB-1024",
        lotTitle: "Toyota Land Cruiser GXR",
        myBidAed: 218000,
        highestBidAed: 218000,
        endsAt: AUCTIONS[0].endsAt,
        isWinning: true,
        status: "LIVE"
    },
    {
        id: "mb-2",
        auctionId: "lot-64e95637-dce9-419a-a08b-2ecf20f8fd20",
        lotNumber: "AUH-2088",
        lotTitle: "BMW X5 M Sport",
        myBidAed: 170750,
        highestBidAed: 171500,
        endsAt: AUCTIONS[1].endsAt,
        isWinning: false,
        status: "LIVE"
    },
    {
        id: "mb-3",
        auctionId: "lot-d57c4a74-f36c-4cf2-a4f3-6d71055895a8",
        lotNumber: "SHJ-3102",
        lotTitle: "Mercedes-Benz E300",
        myBidAed: 198000,
        highestBidAed: 198000,
        endsAt: AUCTIONS[4].endsAt,
        isWinning: true,
        status: "PAYMENT_PENDING"
    }
];
const WATCHLIST = [
    {
        id: "wl-1",
        auctionId: "lot-3125f011-3f34-4068-b0d7-b7000484baab",
        lotNumber: "DXB-5112",
        lotTitle: "Tesla Model Y Long Range",
        myBidAed: 0,
        highestBidAed: 183000,
        endsAt: AUCTIONS[2].endsAt,
        isWinning: false,
        status: "LIVE"
    },
    {
        id: "wl-2",
        auctionId: "lot-72bb6180-ed27-4f0d-84eb-e6e558f127ba",
        lotNumber: "RAK-7601",
        lotTitle: "Nissan Patrol LE Platinum",
        myBidAed: 0,
        highestBidAed: 0,
        endsAt: AUCTIONS[3].endsAt,
        isWinning: false,
        status: "SCHEDULED"
    }
];
function sleep(ms) {
    return new Promise((resolve)=>{
        setTimeout(resolve, ms);
    });
}
async function readHomepageLots() {
    await sleep(90);
    return AUCTIONS.filter((lot)=>lot.status === "LIVE").slice(0, 6).map((lot)=>({
            ...lot
        }));
}
async function readAuctionListing() {
    await sleep(140);
    return AUCTIONS.map((lot)=>({
            ...lot
        }));
}
async function readAuctionDetail(auctionId) {
    await sleep(85);
    const lot = AUCTIONS.find((item)=>item.id === auctionId) ?? null;
    return lot ? {
        ...lot
    } : null;
}
async function readBidHistory(auctionId) {
    await sleep(65);
    return (BID_HISTORY_BY_AUCTION_ID[auctionId] ?? []).slice().sort((left, right)=>right.sequenceNo - left.sequenceNo).map((entry)=>({
            ...entry
        }));
}
async function readWallet() {
    await sleep(80);
    return {
        ...WALLET,
        activeLocks: WALLET.activeLocks.map((lock)=>({
                ...lock
            })),
        transactions: WALLET.transactions.map((tx)=>({
                ...tx
            }))
    };
}
async function readInvoices() {
    await sleep(95);
    return INVOICES.map((invoice)=>({
            ...invoice
        }));
}
async function readInvoiceDetail(invoiceId) {
    await sleep(70);
    const invoice = INVOICES.find((item)=>item.id === invoiceId) ?? null;
    return invoice ? {
        ...invoice
    } : null;
}
async function readMyBids() {
    await sleep(70);
    return MY_BIDS.map((item)=>({
            ...item
        }));
}
async function readWatchlist() {
    await sleep(70);
    return WATCHLIST.map((item)=>({
            ...item
        }));
}
async function readDashboard() {
    await sleep(90);
    const issuedInvoices = INVOICES.filter((invoice)=>invoice.status === "ISSUED").length;
    return {
        activeBids: MY_BIDS.filter((item)=>item.status === "LIVE").length,
        watching: WATCHLIST.length,
        invoicesDue: issuedInvoices,
        depositBalanceAed: WALLET.availableBalanceAed,
        recentActivity: [
            {
                id: "act-1",
                title: "Outbid alert",
                detail: "BMW X5 M Sport moved to AED 171,500",
                createdAt: new Date(Date.now() - 1000 * 60 * 11).toISOString()
            },
            {
                id: "act-2",
                title: "Bid accepted",
                detail: "Toyota Land Cruiser GXR accepted at AED 218,000",
                createdAt: new Date(Date.now() - 1000 * 60 * 38).toISOString()
            },
            {
                id: "act-3",
                title: "Invoice issued",
                detail: "Invoice SHJ-3102 now due within 48h window",
                createdAt: new Date(Date.now() - HOUR * 5).toISOString()
            }
        ]
    };
}
const DEFAULT_AUCTION_FILTERS = {
    query: "",
    status: "ALL",
    location: "ALL",
    seller: "ALL",
    minPriceAed: null,
    maxPriceAed: null,
    minYear: null,
    maxMileageKm: null,
    endingSoonOnly: false,
    sortBy: "ENDING_SOON"
};
function filterAndSortAuctions(auctions, filters) {
    const query = filters.query.trim().toLowerCase();
    const filtered = auctions.filter((lot)=>{
        if (filters.status !== "ALL" && lot.status !== filters.status) {
            return false;
        }
        if (filters.location !== "ALL" && lot.location !== filters.location) {
            return false;
        }
        if (filters.seller !== "ALL" && lot.seller !== filters.seller) {
            return false;
        }
        if (filters.minPriceAed !== null && lot.currentBidAed < filters.minPriceAed) {
            return false;
        }
        if (filters.maxPriceAed !== null && lot.currentBidAed > filters.maxPriceAed) {
            return false;
        }
        if (filters.minYear !== null && lot.year < filters.minYear) {
            return false;
        }
        if (filters.maxMileageKm !== null && lot.mileageKm > filters.maxMileageKm) {
            return false;
        }
        if (filters.endingSoonOnly) {
            const endsAtMs = new Date(lot.endsAt).getTime();
            if (endsAtMs - Date.now() > 1000 * 60 * 60 * 6) {
                return false;
            }
        }
        if (query.length > 0) {
            const haystack = `${lot.lotNumber} ${lot.title} ${lot.location} ${lot.seller}`.toLowerCase();
            if (!haystack.includes(query)) {
                return false;
            }
        }
        return true;
    });
    return filtered.sort((left, right)=>{
        if (filters.sortBy === "LOWEST_PRICE") {
            return left.currentBidAed - right.currentBidAed;
        }
        if (filters.sortBy === "HIGHEST_BIDS") {
            return right.currentBidAed - left.currentBidAed;
        }
        if (filters.sortBy === "RECENTLY_ADDED") {
            return new Date(right.listedAt).getTime() - new Date(left.listedAt).getTime();
        }
        return new Date(left.endsAt).getTime() - new Date(right.endsAt).getTime();
    });
}
function formatAed(amountAed) {
    return new Intl.NumberFormat("en-AE", {
        style: "currency",
        currency: "AED",
        maximumFractionDigits: 0
    }).format(amountAed);
}
function formatShortDateTime(isoDate) {
    return new Intl.DateTimeFormat("en-AE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date(isoDate));
}
function formatLongDate(isoDate) {
    return new Intl.DateTimeFormat("en-AE", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date(isoDate));
}
function getStatusLabel(status) {
    switch(status){
        case "LIVE":
            return "LIVE";
        case "SCHEDULED":
            return "SCHEDULED";
        case "PAYMENT_PENDING":
            return "PAYMENT PENDING";
        case "DEFAULTED":
            return "DEFAULTED";
        default:
            return "ENDED";
    }
}
function getInvoiceDeadlineTone(dueAt, status, now = new Date()) {
    if (status !== "ISSUED") {
        return "resolved";
    }
    const diffHours = (new Date(dueAt).getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours <= 12) {
        return "critical";
    }
    if (diffHours <= 24) {
        return "warning";
    }
    return "normal";
}
function describeInvoiceDeadline(dueAt, status, now = new Date()) {
    if (status === "PAID") {
        return "Settled within the policy window";
    }
    if (status === "DEFAULTED") {
        return "Defaulted under payment policy";
    }
    const diffMs = new Date(dueAt).getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours <= 0) {
        return "Deadline exceeded";
    }
    return `${diffHours}h remaining`;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/modules/ui/transport/components/shared/auction_status_badge.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AuctionStatusBadge",
    ()=>AuctionStatusBadge
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/modules/ui/domain/marketplace_read_model.ts [app-client] (ecmascript)");
;
;
function AuctionStatusBadge({ status }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: `status-badge status-${status.toLowerCase()}`,
        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getStatusLabel"])(status)
    }, void 0, false, {
        fileName: "[project]/src/modules/ui/transport/components/shared/auction_status_badge.tsx",
        lineNumber: 8,
        columnNumber: 10
    }, this);
}
_c = AuctionStatusBadge;
var _c;
__turbopack_context__.k.register(_c, "AuctionStatusBadge");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/modules/ui/transport/components/shared/live_countdown.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LiveCountdown",
    ()=>LiveCountdown
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
function formatCountdown(targetIso, now) {
    const diffMs = new Date(targetIso).getTime() - now;
    if (diffMs <= 0) {
        return {
            text: "00h 00m 00s",
            overdue: true
        };
    }
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    const paddedHours = String(hours).padStart(2, "0");
    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(seconds).padStart(2, "0");
    return {
        text: `${paddedHours}h ${paddedMinutes}m ${paddedSeconds}s`,
        overdue: false
    };
}
function LiveCountdown({ targetIso, prefix, overdueLabel = "Ended", className }) {
    _s();
    const [now, setNow] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "LiveCountdown.useState": ()=>Date.now()
    }["LiveCountdown.useState"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "LiveCountdown.useEffect": ()=>{
            const intervalId = window.setInterval({
                "LiveCountdown.useEffect.intervalId": ()=>{
                    setNow(Date.now());
                }
            }["LiveCountdown.useEffect.intervalId"], 1000);
            return ({
                "LiveCountdown.useEffect": ()=>{
                    window.clearInterval(intervalId);
                }
            })["LiveCountdown.useEffect"];
        }
    }["LiveCountdown.useEffect"], []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "LiveCountdown.useMemo[value]": ()=>formatCountdown(targetIso, now)
    }["LiveCountdown.useMemo[value]"], [
        targetIso,
        now
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
        className: className,
        children: [
            prefix ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                children: [
                    prefix,
                    " "
                ]
            }, void 0, true, {
                fileName: "[project]/src/modules/ui/transport/components/shared/live_countdown.tsx",
                lineNumber: 56,
                columnNumber: 17
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                children: value.overdue ? overdueLabel : value.text
            }, void 0, false, {
                fileName: "[project]/src/modules/ui/transport/components/shared/live_countdown.tsx",
                lineNumber: 57,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/modules/ui/transport/components/shared/live_countdown.tsx",
        lineNumber: 55,
        columnNumber: 5
    }, this);
}
_s(LiveCountdown, "gxrs6YjHEj335h+0iqOrvQk1vkc=");
_c = LiveCountdown;
var _c;
__turbopack_context__.k.register(_c, "LiveCountdown");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AuctionLotCard",
    ()=>AuctionLotCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/image.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/calendar-days.js [app-client] (ecmascript) <export default as CalendarDays>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2d$3$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock3$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/clock-3.js [app-client] (ecmascript) <export default as Clock3>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/map-pin.js [app-client] (ecmascript) <export default as MapPin>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/modules/ui/domain/marketplace_read_model.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$transport$2f$components$2f$shared$2f$auction_status_badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/modules/ui/transport/components/shared/auction_status_badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$transport$2f$components$2f$shared$2f$live_countdown$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/modules/ui/transport/components/shared/live_countdown.tsx [app-client] (ecmascript)");
;
;
;
;
;
;
;
function resolveLotImage(image) {
    if (!image) {
        return "/vehicle-photo.svg";
    }
    if (image.includes("picsum.photos")) {
        return "/vehicle-photo.svg";
    }
    return image;
}
function AuctionLotCard({ lot }) {
    const heroImage = resolveLotImage(lot.images[0]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("article", {
        className: "lot-card",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "lot-image-wrap",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$image$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        src: heroImage,
                        alt: `${lot.make} ${lot.model}`,
                        width: 920,
                        height: 620,
                        className: "lot-image",
                        loading: "lazy"
                    }, void 0, false, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                        lineNumber: 35,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "lot-image-top",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$transport$2f$components$2f$shared$2f$auction_status_badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AuctionStatusBadge"], {
                                status: lot.status
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                lineNumber: 44,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "lot-number",
                                children: lot.lotNumber
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                lineNumber: 45,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                        lineNumber: 43,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                lineNumber: 34,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "lot-content",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        children: lot.title
                    }, void 0, false, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                        lineNumber: 50,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "lot-meta-line",
                        children: [
                            lot.year,
                            " • ",
                            lot.mileageKm.toLocaleString("en-US"),
                            " KM"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                        lineNumber: 51,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "lot-meta-line lot-meta-icon-line",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                                className: "structural-icon",
                                size: 18,
                                "aria-hidden": "true"
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                lineNumber: 55,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: lot.location
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                lineNumber: 56,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                        lineNumber: 54,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "lot-meta-line",
                        children: [
                            "Seller: ",
                            lot.seller
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                        lineNumber: 58,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "lot-price-row",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "lot-price-label",
                                        children: "Current bid"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                        lineNumber: 62,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "lot-price-value",
                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatAed"])(lot.currentBidAed)
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                        lineNumber: 63,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                lineNumber: 61,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "lot-price-label",
                                        children: "Minimum step"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                        lineNumber: 66,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "lot-step-value",
                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatAed"])(lot.minimumStepAed)
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                        lineNumber: 67,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                lineNumber: 65,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                        lineNumber: 60,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "lot-timer-row",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "lot-time-meta",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2d$3$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock3$3e$__["Clock3"], {
                                        className: "structural-icon",
                                        size: 18,
                                        "aria-hidden": "true"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                        lineNumber: 73,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$transport$2f$components$2f$shared$2f$live_countdown$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LiveCountdown"], {
                                        targetIso: lot.endsAt,
                                        prefix: "Ends in",
                                        className: "lot-countdown"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                        lineNumber: 74,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                lineNumber: 72,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "lot-date lot-date-meta",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2d$days$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarDays$3e$__["CalendarDays"], {
                                        className: "structural-icon",
                                        size: 18,
                                        "aria-hidden": "true"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                        lineNumber: 77,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatShortDateTime"])(lot.endsAt)
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                        lineNumber: 78,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                                lineNumber: 76,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                        href: `/auctions/${lot.id}`,
                        className: "button button-primary lot-enter",
                        children: "Enter Lot"
                    }, void 0, false, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                        lineNumber: 82,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
                lineNumber: 49,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
_c = AuctionLotCard;
var _c;
__turbopack_context__.k.register(_c, "AuctionLotCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AuctionFilterSidebar",
    ()=>AuctionFilterSidebar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/modules/ui/domain/marketplace_read_model.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$transport$2f$components$2f$public$2f$auction_lot_card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/modules/ui/transport/components/public/auction_lot_card.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
function toNullableInt(raw) {
    if (raw.trim().length === 0) {
        return null;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        return null;
    }
    return Math.max(0, Math.round(value));
}
function AuctionFilterSidebar({ lots }) {
    _s();
    const [filters, setFilters] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DEFAULT_AUCTION_FILTERS"]);
    const [mobileOpen, setMobileOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const statusOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AuctionFilterSidebar.useMemo[statusOptions]": ()=>Array.from(new Set(lots.map({
                "AuctionFilterSidebar.useMemo[statusOptions]": (lot)=>lot.status
            }["AuctionFilterSidebar.useMemo[statusOptions]"]))).sort()
    }["AuctionFilterSidebar.useMemo[statusOptions]"], [
        lots
    ]);
    const sellerOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AuctionFilterSidebar.useMemo[sellerOptions]": ()=>Array.from(new Set(lots.map({
                "AuctionFilterSidebar.useMemo[sellerOptions]": (lot)=>lot.seller
            }["AuctionFilterSidebar.useMemo[sellerOptions]"]))).sort()
    }["AuctionFilterSidebar.useMemo[sellerOptions]"], [
        lots
    ]);
    const locationOptions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AuctionFilterSidebar.useMemo[locationOptions]": ()=>Array.from(new Set(lots.map({
                "AuctionFilterSidebar.useMemo[locationOptions]": (lot)=>lot.location
            }["AuctionFilterSidebar.useMemo[locationOptions]"]))).sort()
    }["AuctionFilterSidebar.useMemo[locationOptions]"], [
        lots
    ]);
    const filteredLots = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "AuctionFilterSidebar.useMemo[filteredLots]": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["filterAndSortAuctions"])(lots, filters)
    }["AuctionFilterSidebar.useMemo[filteredLots]"], [
        lots,
        filters
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "listing-layout",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                className: "button button-ghost listing-mobile-filter-toggle",
                onClick: ()=>setMobileOpen((value)=>!value),
                children: mobileOpen ? "Hide filters" : "Show filters"
            }, void 0, false, {
                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                lineNumber: 52,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                className: `listing-sidebar ${mobileOpen ? "is-open" : ""}`,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "sidebar-head",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                children: "Filters"
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 62,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                children: [
                                    filteredLots.length,
                                    " lots match"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 63,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 61,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        children: [
                            "Search",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "search",
                                placeholder: "Lot, make, seller",
                                value: filters.query,
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            query: event.target.value
                                        }))
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 68,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 66,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        children: [
                            "Status",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                value: filters.status,
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            status: event.target.value
                                        })),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "ALL",
                                        children: "All"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                        lineNumber: 87,
                                        columnNumber: 13
                                    }, this),
                                    statusOptions.map((status)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: status,
                                            children: status
                                        }, status, false, {
                                            fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                            lineNumber: 89,
                                            columnNumber: 15
                                        }, this))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 78,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 76,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        children: [
                            "Location",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                value: filters.location,
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            location: event.target.value
                                        })),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "ALL",
                                        children: "All"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                        lineNumber: 102,
                                        columnNumber: 13
                                    }, this),
                                    locationOptions.map((location)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: location,
                                            children: location
                                        }, location, false, {
                                            fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                            lineNumber: 104,
                                            columnNumber: 15
                                        }, this))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 98,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 96,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        children: [
                            "Seller",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                value: filters.seller,
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            seller: event.target.value
                                        })),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "ALL",
                                        children: "All"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                        lineNumber: 117,
                                        columnNumber: 13
                                    }, this),
                                    sellerOptions.map((seller)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: seller,
                                            children: seller
                                        }, seller, false, {
                                            fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                            lineNumber: 119,
                                            columnNumber: 15
                                        }, this))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 113,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 111,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        children: [
                            "Min price (AED)",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "number",
                                min: 0,
                                value: filters.minPriceAed ?? "",
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            minPriceAed: toNullableInt(event.target.value)
                                        }))
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 128,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 126,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        children: [
                            "Max price (AED)",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "number",
                                min: 0,
                                value: filters.maxPriceAed ?? "",
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            maxPriceAed: toNullableInt(event.target.value)
                                        }))
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 143,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 141,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        children: [
                            "Min year",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "number",
                                min: 1990,
                                max: 2030,
                                value: filters.minYear ?? "",
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            minYear: toNullableInt(event.target.value)
                                        }))
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 158,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 156,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        children: [
                            "Max mileage (KM)",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "number",
                                min: 0,
                                value: filters.maxMileageKm ?? "",
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            maxMileageKm: toNullableInt(event.target.value)
                                        }))
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 174,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 172,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "sidebar-checkbox",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "checkbox",
                                checked: filters.endingSoonOnly,
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            endingSoonOnly: event.target.checked
                                        }))
                            }, void 0, false, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 188,
                                columnNumber: 11
                            }, this),
                            "Ending soon"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 187,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        children: [
                            "Sort",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                value: filters.sortBy,
                                onChange: (event)=>setFilters((current)=>({
                                            ...current,
                                            sortBy: event.target.value
                                        })),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "ENDING_SOON",
                                        children: "Ending soon"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                        lineNumber: 212,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "LOWEST_PRICE",
                                        children: "Lowest price"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                        lineNumber: 213,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "HIGHEST_BIDS",
                                        children: "Highest bids"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                        lineNumber: 214,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "RECENTLY_ADDED",
                                        children: "Recently added"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                        lineNumber: 215,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                                lineNumber: 203,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 201,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        className: "button button-ghost",
                        onClick: ()=>setFilters(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DEFAULT_AUCTION_FILTERS"]),
                        children: "Reset filters"
                    }, void 0, false, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 219,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "listing-grid",
                "aria-label": "Auction lots",
                children: filteredLots.map((lot)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$transport$2f$components$2f$public$2f$auction_lot_card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AuctionLotCard"], {
                        lot: lot
                    }, lot.id, false, {
                        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                        lineNumber: 226,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
                lineNumber: 224,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/modules/ui/transport/components/public/auction_filter_sidebar.tsx",
        lineNumber: 51,
        columnNumber: 5
    }, this);
}
_s(AuctionFilterSidebar, "QBfsP1ahvl73BSuiavypfrfNSMc=");
_c = AuctionFilterSidebar;
var _c;
__turbopack_context__.k.register(_c, "AuctionFilterSidebar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/modules/ui/transport/components/shared/market_shell.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MarketShell",
    ()=>MarketShell
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const CENTER_NAV = [
    {
        href: "/",
        label: "Home"
    },
    {
        href: "/auctions",
        label: "Auctions"
    }
];
const RIGHT_NAV = [
    {
        href: "/dashboard",
        label: "Dashboard"
    },
    {
        href: "/wallet",
        label: "Wallet"
    }
];
function isActive(pathname, href) {
    if (href === "/") {
        return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}
function MarketShell({ children, hideHeader = false, shellClassName, mainClassName }) {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const shellClasses = [
        "market-shell",
        shellClassName
    ].filter(Boolean).join(" ");
    const mainClasses = [
        "market-main",
        mainClassName
    ].filter(Boolean).join(" ");
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                className: "skip-link",
                href: "#main-content",
                children: "Skip to content"
            }, void 0, false, {
                fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                lineNumber: 49,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: shellClasses,
                children: [
                    !hideHeader ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                        className: "market-header",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "market-header-row",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/",
                                    className: "brand-link",
                                    "aria-label": "Paddock Auction home",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "brand-name",
                                        children: "Paddock"
                                    }, void 0, false, {
                                        fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                                        lineNumber: 58,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                                    lineNumber: 57,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                                    className: "market-nav market-nav-center",
                                    "aria-label": "Primary navigation",
                                    children: CENTER_NAV.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                            href: item.href,
                                            className: isActive(pathname, item.href) ? "is-active" : undefined,
                                            children: item.label
                                        }, item.href, false, {
                                            fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                                            lineNumber: 63,
                                            columnNumber: 19
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                                    lineNumber: 61,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "header-right",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                                            className: "market-nav market-nav-right",
                                            "aria-label": "Buyer navigation",
                                            children: RIGHT_NAV.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                    href: item.href,
                                                    className: isActive(pathname, item.href) ? "is-active" : undefined,
                                                    children: item.label
                                                }, item.href, false, {
                                                    fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                                                    lineNumber: 76,
                                                    columnNumber: 21
                                                }, this))
                                        }, void 0, false, {
                                            fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                                            lineNumber: 74,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                            href: "/login",
                                            className: "auth-link",
                                            children: "Login"
                                        }, void 0, false, {
                                            fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                                            lineNumber: 86,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                            href: "/register",
                                            className: "button button-primary",
                                            children: "Register Company"
                                        }, void 0, false, {
                                            fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                                            lineNumber: 89,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                                    lineNumber: 73,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                            lineNumber: 56,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                        lineNumber: 55,
                        columnNumber: 11
                    }, this) : null,
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                        id: "main-content",
                        className: mainClasses,
                        children: children
                    }, void 0, false, {
                        fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/modules/ui/transport/components/shared/market_shell.tsx",
                lineNumber: 53,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true);
}
_s(MarketShell, "xbyQPtUVMO7MNj7WjJlpdWqRcTo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = MarketShell;
var _c;
__turbopack_context__.k.register(_c, "MarketShell");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_modules_ui_ab06a781._.js.map
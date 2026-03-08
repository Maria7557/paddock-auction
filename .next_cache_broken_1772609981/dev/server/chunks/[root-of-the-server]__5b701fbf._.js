module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/src/modules/ui/domain/marketplace_read_model.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/app/api/ui/auctions/[auctionId]/bids/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/modules/ui/domain/marketplace_read_model.ts [app-route] (ecmascript)");
;
async function GET(_request, context) {
    const params = await context.params;
    const bids = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$modules$2f$ui$2f$domain$2f$marketplace_read_model$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["readBidHistory"])(params.auctionId);
    return Response.json({
        auction_id: params.auctionId,
        bids: bids.map((bid)=>({
                id: bid.id,
                bidder_alias: bid.bidderAlias,
                amount_aed: bid.amountAed,
                placed_at: bid.placedAt,
                sequence_no: bid.sequenceNo,
                is_mine: bid.isMine ?? false
            }))
    }, {
        status: 200
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__5b701fbf._.js.map
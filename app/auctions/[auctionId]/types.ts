import type { DamageMapValue } from "@/components/seller/DamageDiagram";
import type { SellerVehicleFeatures } from "@/components/seller/vehicle-form-state";

export type LotAuctionState =
  | "DRAFT"
  | "SCHEDULED"
  | "LIVE"
  | "EXTENDED"
  | "PAYMENT_PENDING"
  | "ENDED"
  | "DEFAULTED"
  | "CLOSED"
  | "PAID"
  | "CANCELED"
  | "RELISTED";

export type LotWarrantyStatus = "ACTIVE" | "EXPIRED" | "NONE";

export type LotConditionGrade = string;

export type LotStartCode = "Run & Drive" | "Stationary";

export type SimilarLot = {
  id: string;
  auctionId: string;
  title: string;
  year: number;
  mileageKm: number;
  currentBidAed: number;
  state: string;
  imageUrl: string;
  showVipEarlyAccessBadge?: boolean;
};

export type LotDetail = {
  id: string;
  lotNumber: string;
  auctionId: string;
  state: LotAuctionState;
  showVipEarlyAccessBadge: boolean;
  vipReleaseAt: string | null;
  title: string;
  make: string;
  model: string;
  series: string;
  year: number;
  vin: string;
  mileageKm: number;
  color: string;
  colorInterior: string;
  interiorMaterial: string;
  condition: string;
  conditionGrade: LotConditionGrade;
  regionSpec: string;
  airbags: string;
  airbagCount: number | null;
  damage: string;
  primaryDamage: string;
  titleStatus: string;
  startCode: LotStartCode;
  numberOfKeys: number;
  tireCondition: number | null;
  warrantyStatus: LotWarrantyStatus;
  serviceHistory: string;
  manufacturedIn: string;
  estimatedValue: number | null;
  damageMap: DamageMapValue;
  damageItems: Array<{
    label: string;
    level: "MINOR" | "MAJOR";
  }>;
  bodyStyle: string;
  engine: string;
  transmission: string;
  driveType: string;
  fuelType: string;
  cylinders: string;
  vehicleClass: string;
  lossType: string;
  features: SellerVehicleFeatures;
  description: string;
  highlights: string[];
  sellerName: string;
  sellerRef: string;
  location: string;
  auctionAt: string;
  actualCashValue: number;
  currentBidAed: number;
  buyNowAed: number;
  minStepAed: number;
  totalBids: number;
  endsAt: string;
  startsAt: string;
  images: string[];
  bids: Array<{
    id: string;
    maskedBidder: string;
    amountAed: number;
    placedAt: string;
  }>;
  similar: SimilarLot[];
};

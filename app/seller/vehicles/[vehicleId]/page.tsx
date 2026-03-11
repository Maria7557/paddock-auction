import SellerVehicleDetailClient from "@/app/seller/vehicles/[vehicleId]/vehicle-detail-client";

type PageProps = {
  params: Promise<{ vehicleId: string }>;
};

export default async function SellerVehicleDetailPage({ params }: PageProps) {
  const { vehicleId } = await params;

  return <SellerVehicleDetailClient vehicleId={vehicleId} />;
}

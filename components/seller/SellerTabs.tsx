import { TabPill } from "@/components/seller/TabPill";

export function SellerTabs() {
  return (
    <div className="seller-tabs">
      <TabPill href="/seller/dashboard" label="Dashboard" />
      <TabPill href="/seller/vehicles" label="My Vehicles" />
      <TabPill href="/seller/vehicles/new" label="+ Add Vehicle" variant="primary" />
    </div>
  );
}

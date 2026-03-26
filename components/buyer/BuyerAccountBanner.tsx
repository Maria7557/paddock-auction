type BuyerAccountBannerProps = {
  userStatus: string;
  companyStatus: string | null;
};

function isRestrictedStatus(status: string | null): boolean {
  const normalized = status?.trim().toUpperCase() ?? "";
  return normalized === "BLOCKED" || normalized === "REJECTED";
}

export function BuyerAccountBanner({ userStatus, companyStatus }: BuyerAccountBannerProps) {
  if (!isRestrictedStatus(userStatus) && !isRestrictedStatus(companyStatus)) {
    return null;
  }

  return (
    <p className="inline-note tone-warning">
      This buyer account is not active right now. Deposits and purchasing actions are unavailable until the account is restored.
    </p>
  );
}

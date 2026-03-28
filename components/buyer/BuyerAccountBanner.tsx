type BuyerAccountBannerProps = {
  userStatus: string;
  companyStatus: string | null;
};

function isActiveStatus(status: string | null): boolean {
  return status?.trim().toUpperCase() === "ACTIVE";
}

export function BuyerAccountBanner({ userStatus, companyStatus }: BuyerAccountBannerProps) {
  if (isActiveStatus(userStatus) && isActiveStatus(companyStatus)) {
    return null;
  }

  const normalizedUserStatus = userStatus.trim().toUpperCase();
  const normalizedCompanyStatus = companyStatus?.trim().toUpperCase() ?? "";
  const isPending =
    normalizedUserStatus === "PENDING_APPROVAL" ||
    normalizedCompanyStatus === "PENDING_APPROVAL" ||
    normalizedCompanyStatus === "PENDING";

  return (
    <p className="inline-note tone-warning">
      {isPending
        ? "Account pending admin approval. You can access your buyer workspace now, but deposits, bids, and Buy Now stay locked until activation."
        : "This buyer account is not active right now. Deposits and purchasing actions are unavailable until the account is restored."}
    </p>
  );
}

import { redirect } from "next/navigation";

type InvoiceDetailPageProps = {
  params: Promise<{ id: string }> | { id: string };
};

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const resolvedParams = await Promise.resolve(params);

  redirect(`/finance/invoices/${resolvedParams.id}`);
}

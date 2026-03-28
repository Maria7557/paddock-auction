import { redirect } from "next/navigation";

type InvoiceDetailPageProps = {
  params: Promise<{ invoiceId: string }> | { invoiceId: string };
};

export default async function FinanceInvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const resolvedParams = await Promise.resolve(params);
  redirect(`/invoices/${resolvedParams.invoiceId}`);
}

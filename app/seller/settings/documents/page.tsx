"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DocumentUploadCard } from "@/components/seller/DocumentUploadCard";

type SellerDocument = {
  id: string;
  type: string;
  fileName: string;
  fileUrl: string;
  status: string;
  uploadedAt: string;
};

type DocumentsResponse = {
  documents: SellerDocument[];
};

const DOC_TYPES = [
  { type: "TRADE_LICENSE", title: "Trade License", required: true },
  { type: "VAT_CERTIFICATE", title: "VAT Certificate", required: false },
  { type: "COMMERCIAL_REGISTRATION", title: "Commercial Registration", required: false },
] as const;

export default function SellerSettingsDocumentsPage() {
  const [documents, setDocuments] = useState<SellerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/seller/documents", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as DocumentsResponse | { error?: string } | null;

      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Failed to load documents");
      }

      setDocuments((payload as DocumentsResponse)?.documents ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const byType = useMemo(() => {
    const map = new Map<string, SellerDocument>();

    for (const document of documents) {
      map.set(document.type, document);
    }

    return map;
  }, [documents]);

  async function onUpload(type: string, file: File): Promise<void> {
    setUploadingType(type);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set("type", type);
      formData.set("file", file);

      const response = await fetch("/api/seller/documents", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "Failed to upload document");
      }

      setNotice("Document uploaded");
      await loadDocuments();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploadingType(null);
    }
  }

  return (
    <section className="seller-section-stack">
      {loading ? <p className="text-muted">Loading documents...</p> : null}
      {error ? <p className="inline-note tone-error">{error}</p> : null}
      {notice ? <p className="inline-note tone-success">{notice}</p> : null}

      <section className="seller-doc-grid">
        {DOC_TYPES.map((doc) => (
          <DocumentUploadCard
            key={doc.type}
            title={doc.title}
            type={doc.type}
            required={doc.required}
            document={byType.get(doc.type) ?? null}
            onUpload={(type, file) => {
              void onUpload(type, file);
            }}
            uploading={uploadingType === doc.type}
          />
        ))}
      </section>
    </section>
  );
}

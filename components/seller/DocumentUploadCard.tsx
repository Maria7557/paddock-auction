import { formatSellerDateTime } from "@/components/seller/utils";

type SellerDocument = {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
  status: string;
};

type DocumentUploadCardProps = {
  title: string;
  type: string;
  required?: boolean;
  document: SellerDocument | null;
  onUpload: (type: string, file: File) => void;
  uploading: boolean;
};

export function DocumentUploadCard({
  title,
  type,
  required = false,
  document,
  onUpload,
  uploading,
}: DocumentUploadCardProps) {
  return (
    <article className="surface-panel seller-doc-card">
      <div className="seller-doc-head">
        <h3>{title}</h3>
        {required ? <span className="seller-doc-required">Required</span> : null}
      </div>

      {document ? (
        <div className="seller-doc-meta">
          <p>{document.fileName}</p>
          <p>Uploaded: {formatSellerDateTime(document.uploadedAt)}</p>
          <span className="seller-doc-status">{document.status}</span>
        </div>
      ) : (
        <p className="text-muted">No document uploaded.</p>
      )}

      <label className="seller-upload-btn" aria-label={`Upload ${title}`}>
        {uploading ? "Uploading..." : document ? "Replace" : "Upload"}
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onUpload(type, file);
            }
          }}
          disabled={uploading}
          hidden
        />
      </label>
    </article>
  );
}

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MULKIYA_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const UPLOAD_ROOT = path.join(process.cwd(), ".tmp", "dev-seller-vehicle-media");

type UploadKind = "photo" | "mulkiya-front" | "mulkiya-back";

function isUploadKind(value: string | null): value is UploadKind {
  return value === "photo" || value === "mulkiya-front" || value === "mulkiya-back";
}

function isSafeSegment(value: string | null): value is string {
  if (!value) {
    return false;
  }

  return !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..";
}

function extensionFromContentType(contentType: string): string {
  if (contentType === "image/png") {
    return ".png";
  }

  if (contentType === "application/pdf") {
    return ".pdf";
  }

  return ".jpg";
}

function buildFileName(kind: UploadKind, index: string | null, contentType: string): string {
  const extension = extensionFromContentType(contentType);

  if (kind === "photo") {
    const safeIndex = index && /^\d+$/.test(index) ? index : "0";
    return `photo-${safeIndex.padStart(2, "0")}${extension}`;
  }

  if (kind === "mulkiya-front") {
    return `mulkiya-front${extension}`;
  }

  return `mulkiya-back${extension}`;
}

function validateContentType(kind: UploadKind, contentType: string): string | null {
  const allowedTypes = kind === "photo" ? PHOTO_MIME_TYPES : MULKIYA_MIME_TYPES;

  if (!allowedTypes.has(contentType)) {
    return `Invalid ${kind} file type.`;
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId");
  const kind = url.searchParams.get("kind");
  const index = url.searchParams.get("index");

  if (!isSafeSegment(batchId) || !isUploadKind(kind)) {
    return NextResponse.json({ error: "Invalid upload parameters" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const typeError = validateContentType(kind, contentType);

  if (typeError) {
    return NextResponse.json({ error: typeError }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await request.arrayBuffer());

    if (buffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `${kind} must be 10MB or less.` }, { status: 400 });
    }

    const batchDir = path.join(UPLOAD_ROOT, batchId);
    const fileName = buildFileName(kind, index, contentType);

    await mkdir(batchDir, { recursive: true });
    await writeFile(path.join(batchDir, fileName), buffer);

    return NextResponse.json({
      url: `/dev-api/seller/vehicles/media/${batchId}/${fileName}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload file";

    console.error("Dev single-file upload failed", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

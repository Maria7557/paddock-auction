import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_PHOTO_COUNT = 10;
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MULKIYA_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const UPLOAD_ROOT = path.join(process.cwd(), ".tmp", "dev-seller-vehicle-media");

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

function getExtension(file: File): string {
  const parsed = path.extname(file.name).toLowerCase();

  if (parsed) {
    return parsed;
  }

  if (file.type === "image/png") {
    return ".png";
  }

  if (file.type === "application/pdf") {
    return ".pdf";
  }

  return ".jpg";
}

async function persistFile(file: File, batchDir: string, targetName: string): Promise<string> {
  const targetPath = path.join(batchDir, targetName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(targetPath, buffer);

  return targetPath;
}

function validateFile(file: File, allowedTypes: Set<string>, fieldName: string): string | null {
  if (!allowedTypes.has(file.type)) {
    return `Invalid ${fieldName} file type.`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return `${fieldName} must be 10MB or less.`;
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const photos = formData.getAll("photos").filter(isFile);
    const mulkiyaFront = formData.get("mulkiyaFront");
    const mulkiyaBack = formData.get("mulkiyaBack");

    if (photos.length < MIN_PHOTO_COUNT) {
      return NextResponse.json(
        { error: `Please upload at least ${MIN_PHOTO_COUNT} photos before submitting.` },
        { status: 400 },
      );
    }

    if (!isFile(mulkiyaFront) || !isFile(mulkiyaBack)) {
      return NextResponse.json(
        { error: "Please upload both front and back sides of the Mulkiya." },
        { status: 400 },
      );
    }

    for (const photo of photos) {
      const error = validateFile(photo, PHOTO_MIME_TYPES, "Photo");

      if (error) {
        return NextResponse.json({ error }, { status: 400 });
      }
    }

    for (const [file, label] of [
      [mulkiyaFront, "Mulkiya front"],
      [mulkiyaBack, "Mulkiya back"],
    ] as const) {
      const error = validateFile(file, MULKIYA_MIME_TYPES, label);

      if (error) {
        return NextResponse.json({ error }, { status: 400 });
      }
    }

    const batchId = `${Date.now()}-${randomUUID()}`;
    const batchDir = path.join(UPLOAD_ROOT, batchId);

    await mkdir(batchDir, { recursive: true });

    const photoUrls: string[] = [];

    for (const [index, photo] of photos.entries()) {
      const extension = getExtension(photo);
      const fileName = `photo-${String(index + 1).padStart(2, "0")}${extension}`;

      await persistFile(photo, batchDir, fileName);
      photoUrls.push(`/dev-api/seller/vehicles/media/${batchId}/${fileName}`);
    }

    const mulkiyaFrontName = `mulkiya-front${getExtension(mulkiyaFront)}`;
    const mulkiyaBackName = `mulkiya-back${getExtension(mulkiyaBack)}`;

    await persistFile(mulkiyaFront, batchDir, mulkiyaFrontName);
    await persistFile(mulkiyaBack, batchDir, mulkiyaBackName);

    return NextResponse.json({
      photos: photoUrls,
      mulkiyaFrontUrl: `/dev-api/seller/vehicles/media/${batchId}/${mulkiyaFrontName}`,
      mulkiyaBackUrl: `/dev-api/seller/vehicles/media/${batchId}/${mulkiyaBackName}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload media";

    console.error("Dev media upload failed", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

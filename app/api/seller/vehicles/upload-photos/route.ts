import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyJwt } from "@/src/lib/auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MULKIYA_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const UPLOAD_ROOT = path.join(process.cwd(), ".tmp", "seller-vehicle-media");

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

type VehicleMediaSession =
  | {
      batchPrefix: string;
      role: "SELLER";
    }
  | {
      batchPrefix: string;
      role: "ADMIN";
    };

async function requireVehicleMediaSession(): Promise<VehicleMediaSession | NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value?.trim();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyJwt(token);

  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (payload.role === "SELLER" && payload.companyId) {
    return {
      batchPrefix: payload.companyId,
      role: "SELLER",
    };
  }

  if (payload.role === "ADMIN" && payload.userId) {
    return {
      batchPrefix: `admin-${payload.userId}`,
      role: "ADMIN",
    };
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function persistFile(file: File, batchDir: string, targetName: string): Promise<void> {
  const targetPath = path.join(batchDir, targetName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(targetPath, buffer);
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

function hasMultipartContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("multipart/form-data");
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireVehicleMediaSession();

    if (session instanceof Response) {
      return session;
    }

    if (!hasMultipartContentType(request)) {
      return NextResponse.json({ error: "Content-Type must be multipart/form-data." }, { status: 400 });
    }

    const formData = await request.formData();
    const photos = formData.getAll("photos").filter(isFile);
    const mulkiyaFront = formData.get("mulkiyaFront");
    const mulkiyaBack = formData.get("mulkiyaBack");
    const mulkiyaFrontFile = isFile(mulkiyaFront) ? mulkiyaFront : null;
    const mulkiyaBackFile = isFile(mulkiyaBack) ? mulkiyaBack : null;

    if (photos.length === 0 && !mulkiyaFrontFile && !mulkiyaBackFile) {
      return NextResponse.json(
        { error: "Please upload at least one photo or document." },
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
      [mulkiyaFrontFile, "Mulkiya front"],
      [mulkiyaBackFile, "Mulkiya back"],
    ] as const) {
      if (!file) {
        continue;
      }

      const error = validateFile(file, MULKIYA_MIME_TYPES, label);

      if (error) {
        return NextResponse.json({ error }, { status: 400 });
      }
    }

    const batchId = `${session.batchPrefix}-${Date.now()}-${randomUUID()}`;
    const batchDir = path.join(UPLOAD_ROOT, batchId);

    await mkdir(batchDir, { recursive: true });

    const photoUrls: string[] = [];

    for (const [index, photo] of photos.entries()) {
      const extension = getExtension(photo);
      const fileName = `photo-${String(index + 1).padStart(2, "0")}${extension}`;

      await persistFile(photo, batchDir, fileName);
      photoUrls.push(`/api/seller/vehicles/media/${batchId}/${fileName}`);
    }

    let mulkiyaFrontUrl: string | null = null;
    let mulkiyaBackUrl: string | null = null;

    if (mulkiyaFrontFile) {
      const mulkiyaFrontName = `mulkiya-front${getExtension(mulkiyaFrontFile)}`;
      await persistFile(mulkiyaFrontFile, batchDir, mulkiyaFrontName);
      mulkiyaFrontUrl = `/api/seller/vehicles/media/${batchId}/${mulkiyaFrontName}`;
    }

    if (mulkiyaBackFile) {
      const mulkiyaBackName = `mulkiya-back${getExtension(mulkiyaBackFile)}`;
      await persistFile(mulkiyaBackFile, batchDir, mulkiyaBackName);
      mulkiyaBackUrl = `/api/seller/vehicles/media/${batchId}/${mulkiyaBackName}`;
    }

    return NextResponse.json({
      photos: photoUrls,
      mulkiyaFrontUrl,
      mulkiyaBackUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload media";

    console.error("Vehicle media upload failed", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

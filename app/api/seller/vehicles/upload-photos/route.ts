export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MULKIYA_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

function safeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function validateFile(file: File, allowedTypes: Set<string>): string | null {
  if (!allowedTypes.has(file.type)) {
    return "INVALID_FILE_TYPE";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "FILE_TOO_LARGE";
  }

  return null;
}

async function saveUpload(companyId: string, file: File, prefix: string): Promise<string> {
  const extension = path.extname(file.name) || ".bin";
  const baseName = safeFileName(path.basename(file.name, extension));
  const fileName = `${Date.now()}-${prefix}-${randomUUID()}-${baseName}${extension}`;
  const folder = path.join(process.cwd(), "public", "uploads", "seller-vehicles", companyId);
  const absolutePath = path.join(folder, fileName);
  const publicUrl = `/uploads/seller-vehicles/${companyId}/${fileName}`;

  await mkdir(folder, { recursive: true });
  await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

  return publicUrl;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const formData = await request.formData();
  const photoFiles = formData.getAll("photos").filter((entry): entry is File => entry instanceof File);
  const mulkiyaFront = formData.get("mulkiyaFront");
  const mulkiyaBack = formData.get("mulkiyaBack");

  if (photoFiles.length < 10) {
    return NextResponse.json(
      {
        error: "NOT_ENOUGH_PHOTOS",
        message: "Please upload at least 10 photos.",
      },
      { status: 400 },
    );
  }

  if (!(mulkiyaFront instanceof File) || !(mulkiyaBack instanceof File)) {
    return NextResponse.json(
      {
        error: "MISSING_MULKIYA",
        message: "Both Mulkiya files are required.",
      },
      { status: 400 },
    );
  }

  for (const file of photoFiles) {
    const validationError = validateFile(file, PHOTO_MIME_TYPES);

    if (validationError) {
      return NextResponse.json(
        {
          error: validationError,
          message: "Photo files must be JPG/PNG and 10MB or less.",
        },
        { status: 400 },
      );
    }
  }

  for (const file of [mulkiyaFront, mulkiyaBack]) {
    const validationError = validateFile(file, MULKIYA_MIME_TYPES);

    if (validationError) {
      return NextResponse.json(
        {
          error: validationError,
          message: "Mulkiya files must be JPG/PNG/PDF and 10MB or less.",
        },
        { status: 400 },
      );
    }
  }

  const photos = await Promise.all(photoFiles.map((file, index) => saveUpload(auth.companyId, file, `photo-${index}`)));
  const [mulkiyaFrontUrl, mulkiyaBackUrl] = await Promise.all([
    saveUpload(auth.companyId, mulkiyaFront, "mulkiya-front"),
    saveUpload(auth.companyId, mulkiyaBack, "mulkiya-back"),
  ]);

  return NextResponse.json({
    photos,
    mulkiyaFrontUrl,
    mulkiyaBackUrl,
  });
}

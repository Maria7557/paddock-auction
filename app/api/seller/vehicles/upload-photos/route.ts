import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyJwt } from "@/src/lib/auth";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const MULKIYA_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "seller-vehicles");

type SavedUpload = {
  url: string;
};

function extensionFor(file: File): string {
  const explicit = path.extname(file.name).toLowerCase();

  if (explicit) {
    return explicit;
  }

  if (file.type === "image/jpeg") {
    return ".jpg";
  }

  if (file.type === "image/png") {
    return ".png";
  }

  if (file.type === "application/pdf") {
    return ".pdf";
  }

  return "";
}

async function requireSellerToken(): Promise<
  | {
      companyId: string;
    }
  | NextResponse
> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value?.trim();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyJwt(token);

  if (!payload || payload.role !== "SELLER" || !payload.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return {
    companyId: payload.companyId,
  };
}

async function saveFile(input: {
  companyId: string;
  folder: "photos" | "mulkiya";
  file: File;
}): Promise<SavedUpload> {
  const dir = path.join(UPLOAD_ROOT, input.companyId, input.folder);
  const filename = `${Date.now()}-${randomUUID()}${extensionFor(input.file)}`;
  const filepath = path.join(dir, filename);
  const bytes = Buffer.from(await input.file.arrayBuffer());

  await mkdir(dir, { recursive: true });
  await writeFile(filepath, bytes);

  return {
    url: `/uploads/seller-vehicles/${input.companyId}/${input.folder}/${filename}`,
  };
}

function asFile(value: FormDataEntryValue | null): File | null {
  if (!value || !(value instanceof File)) {
    return null;
  }

  return value;
}

function validateFile(file: File, allowedTypes: Set<string>): string | null {
  if (!allowedTypes.has(file.type)) {
    return "Invalid file type. Allowed: JPG, PNG (Mulkiya also supports PDF).";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "Each file must be 10MB or less.";
  }

  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSellerToken();

  if (session instanceof NextResponse) {
    return session;
  }

  const formData = await request.formData();
  const photoFiles = formData.getAll("photos").filter((value): value is File => value instanceof File);
  const mulkiyaFront = asFile(formData.get("mulkiyaFront"));
  const mulkiyaBack = asFile(formData.get("mulkiyaBack"));

  if (photoFiles.length < 10) {
    return NextResponse.json(
      { error: "Please upload at least 10 photos before submitting." },
      { status: 400 },
    );
  }

  if (!mulkiyaFront || !mulkiyaBack) {
    return NextResponse.json(
      { error: "Please upload both front and back sides of the Mulkiya." },
      { status: 400 },
    );
  }

  for (const photo of photoFiles) {
    const validationError = validateFile(photo, IMAGE_MIME_TYPES);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  const mulkiyaFrontError = validateFile(mulkiyaFront, MULKIYA_MIME_TYPES);

  if (mulkiyaFrontError) {
    return NextResponse.json({ error: mulkiyaFrontError }, { status: 400 });
  }

  const mulkiyaBackError = validateFile(mulkiyaBack, MULKIYA_MIME_TYPES);

  if (mulkiyaBackError) {
    return NextResponse.json({ error: mulkiyaBackError }, { status: 400 });
  }

  const photos = await Promise.all(
    photoFiles.map(async (file) => {
      const saved = await saveFile({
        companyId: session.companyId,
        folder: "photos",
        file,
      });

      return saved.url;
    }),
  );

  const savedMulkiyaFront = await saveFile({
    companyId: session.companyId,
    folder: "mulkiya",
    file: mulkiyaFront,
  });
  const savedMulkiyaBack = await saveFile({
    companyId: session.companyId,
    folder: "mulkiya",
    file: mulkiyaBack,
  });

  return NextResponse.json({
    photos,
    mulkiyaFrontUrl: savedMulkiyaFront.url,
    mulkiyaBackUrl: savedMulkiyaBack.url,
  });
}

export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import prisma from "@/src/infrastructure/database/prisma";

import { requireSellerApiAuth } from "@/app/api/seller/_lib/auth";

const ALLOWED_TYPES = new Set(["TRADE_LICENSE", "VAT_CERTIFICATE", "COMMERCIAL_REGISTRATION"]);

function safeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: "SELLER_DOCUMENT",
      entityId: {
        startsWith: `${auth.companyId}:`,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      entityId: true,
      createdAt: true,
      payload: true,
    },
  });

  const deduped = new Map<string, { id: string; type: string; fileName: string; fileUrl: string; status: string; uploadedAt: string }>();

  for (const log of logs) {
    const payload = log.payload as Record<string, unknown>;
    const type = typeof payload.type === "string" ? payload.type : "UNKNOWN";

    if (deduped.has(type)) {
      continue;
    }

    deduped.set(type, {
      id: log.id,
      type,
      fileName: typeof payload.fileName === "string" ? payload.fileName : "-",
      fileUrl: typeof payload.fileUrl === "string" ? payload.fileUrl : "",
      status: typeof payload.status === "string" ? payload.status : "PENDING",
      uploadedAt: log.createdAt.toISOString(),
    });
  }

  return NextResponse.json({
    documents: [...deduped.values()],
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = requireSellerApiAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const formData = await request.formData();
  const typeRaw = String(formData.get("type") ?? "").trim().toUpperCase();

  if (!ALLOWED_TYPES.has(typeRaw)) {
    return NextResponse.json(
      {
        error: "INVALID_TYPE",
      },
      { status: 400 },
    );
  }

  const uploaded = formData.get("file");

  if (!(uploaded instanceof File)) {
    return NextResponse.json(
      {
        error: "MISSING_FILE",
      },
      { status: 400 },
    );
  }

  const extension = path.extname(uploaded.name) || ".bin";
  const baseName = safeFileName(path.basename(uploaded.name, extension));
  const fileName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;
  const folder = path.join(process.cwd(), "public", "uploads", "seller-documents", auth.companyId);
  const absolutePath = path.join(folder, fileName);
  const publicUrl = `/uploads/seller-documents/${auth.companyId}/${fileName}`;

  await mkdir(folder, { recursive: true });
  const data = Buffer.from(await uploaded.arrayBuffer());
  await writeFile(absolutePath, data);

  const payload = {
    type: typeRaw,
    fileName: uploaded.name,
    fileUrl: publicUrl,
    mimeType: uploaded.type,
    sizeBytes: uploaded.size,
    status: "PENDING",
  };

  const log = await prisma.auditLog.create({
    data: {
      actorId: auth.userId,
      action: "SELLER_DOCUMENT_UPLOADED",
      entityType: "SELLER_DOCUMENT",
      entityId: `${auth.companyId}:${typeRaw}`,
      payload,
      payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      document: {
        id: log.id,
        type: typeRaw,
        fileName: uploaded.name,
        fileUrl: publicUrl,
        status: "PENDING",
        uploadedAt: log.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

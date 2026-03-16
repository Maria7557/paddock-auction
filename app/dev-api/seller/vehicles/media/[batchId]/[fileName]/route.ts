import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UPLOAD_ROOT = path.join(process.cwd(), ".tmp", "dev-seller-vehicle-media");

function resolveContentType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();

  switch (extension) {
    case ".png":
      return "image/png";
    case ".pdf":
      return "application/pdf";
    case ".jpg":
    case ".jpeg":
    default:
      return "image/jpeg";
  }
}

function isSafeSegment(value: string): boolean {
  return value.length > 0 && !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string; fileName: string }> },
): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { batchId, fileName } = await context.params;

  if (!isSafeSegment(batchId) || !isSafeSegment(fileName)) {
    return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
  }

  try {
    const filePath = path.join(UPLOAD_ROOT, batchId, fileName);
    const buffer = await readFile(filePath);

    return new Response(buffer, {
      headers: {
        "content-type": resolveContentType(fileName),
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
}

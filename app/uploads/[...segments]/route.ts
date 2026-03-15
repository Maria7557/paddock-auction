import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".pdf") {
    return "application/pdf";
  }

  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ segments: string[] }> },
): Promise<NextResponse> {
  const { segments } = await context.params;

  if (!Array.isArray(segments) || segments.length === 0 || segments.some((segment) => segment.includes(".."))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(UPLOAD_ROOT, ...segments);

  if (!filePath.startsWith(UPLOAD_ROOT)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const bytes = await readFile(filePath);

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentTypeFor(filePath),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

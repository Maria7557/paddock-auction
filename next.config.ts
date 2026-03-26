import type { NextConfig } from "next";

function normalizeLoopbackApiUrl(value: string): string {
  try {
    const normalized = new URL(value);

    if (normalized.hostname === "localhost" || normalized.hostname === "::1") {
      normalized.hostname = "127.0.0.1";
    }

    return normalized.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

const apiUrl = normalizeLoopbackApiUrl(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000");

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    proxyClientMaxBodySize: "150mb",
  },
  async rewrites() {
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${apiUrl}/api/:path*`,
        },
      ],
    };
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
};

export default nextConfig;

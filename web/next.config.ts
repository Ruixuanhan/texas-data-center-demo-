import type { NextConfig } from "next";

const radarApiUpstream = process.env.RADAR_API_UPSTREAM ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${radarApiUpstream}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

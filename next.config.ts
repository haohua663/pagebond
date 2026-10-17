import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mammoth", "unpdf"],
  agentRules: false,
  // Private LAN hosts so a phone on the same Wi-Fi can load the dev server (HMR + hydration).
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;

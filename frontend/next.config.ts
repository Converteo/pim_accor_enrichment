import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  agentRules: false,
  // Self-contained server bundle (.next/standalone) for the Docker image / Cloud Run.
  output: "standalone",
};

export default withNextIntl(nextConfig);

import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@claudebiz/ui", "@claudebiz/db"],
};

export default config;

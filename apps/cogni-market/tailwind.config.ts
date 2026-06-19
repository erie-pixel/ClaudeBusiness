import type { Config } from "tailwindcss";
import { sharedTailwindConfig } from "@claudebiz/ui";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  ...sharedTailwindConfig,
};

export default config;

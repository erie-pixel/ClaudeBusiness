import type { Config } from "tailwindcss";
import { colors } from "./tokens";

export const sharedTailwindConfig: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        "primary-active": colors.primaryActive,
        "primary-disabled": colors.primaryDisabled,
        ink: colors.ink,
        body: colors.body,
        "body-strong": colors.bodyStrong,
        muted: colors.muted,
        "muted-soft": colors.mutedSoft,
        hairline: colors.hairline,
        canvas: colors.canvas,
        "surface-soft": colors.surfaceSoft,
        "surface-card": colors.surfaceCard,
        "surface-dark": colors.surfaceDark,
        "surface-dark-elevated": colors.surfaceDarkElevated,
        "on-dark": colors.onDark,
        "on-dark-soft": colors.onDarkSoft,
        "accent-teal": colors.accentTeal,
        "accent-amber": colors.accentAmber,
        success: colors.success,
        error: colors.error,
      },
      fontFamily: {
        display: ["Copernicus", "Tiempos Headline", "Cormorant Garamond", "Georgia", "serif"],
        sans: ["StyreneB", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "9999px",
      },
      spacing: {
        section: "96px",
        xxl: "48px",
      },
      letterSpacing: {
        display: "-0.03em",
        "display-lg": "-0.02em",
        "display-sm": "-0.01em",
      },
    },
  },
};

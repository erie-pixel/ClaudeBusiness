import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CogniMarket — Cognitive Task Paradigms",
  description: "Research-grade cognitive testing paradigms. License and build with validated N-back, Stroop, Trail Making tasks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

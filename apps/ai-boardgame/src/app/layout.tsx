import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dungeon.AI — AI-Powered Co-op Boardgame",
  description: "Play tabletop RPG adventures with friends. AI Dungeon Master narrates, arbitrates, and adapts — you explore together.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

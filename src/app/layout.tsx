import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import CommandPalette from "@/components/CommandPalette";

export const metadata: Metadata = {
  title: "Baseline AI Workforce",
  description: "Local-first mission control for Claude Code and the rest of your AI workforce.",
};

export const viewport: Viewport = {
  themeColor: "#0d0a12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex" style={{ minHeight: "100dvh" }}>
          <Sidebar />
          <main className="scroll min-w-0 flex-1 overflow-y-auto" style={{ height: "100dvh" }}>
            {children}
          </main>
        </div>
        <CommandPalette />
      </body>
    </html>
  );
}

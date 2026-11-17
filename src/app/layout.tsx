import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Padel Coach Hub – by Ben",
  description: "Coaching padel : groupes, planning, crédits, tournois et communauté",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Coach Hub", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#7C3AED", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

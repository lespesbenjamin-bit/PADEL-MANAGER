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
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('pch-theme');if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}" }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

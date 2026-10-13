import { AppShell } from "@/components/app-shell";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geist = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TESIS Observer",
  description:
    "Read-only web observer and artifact explorer for the TESIS autonomous penetration-testing framework (DVWA sandbox).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable}>
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TESIS Observer",
  description:
    "Read-only web observer and artifact explorer for the TESIS autonomous penetration-testing framework (DVWA sandbox).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">
        {/* viewport header */}
        <header className="relative z-10 flex items-center justify-between border-b border-graphite-700/70 bg-graphite-900/80 px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm border border-ember-500/40 bg-ember-500/10">
              <span className="font-display text-[12px] font-bold text-ember-400">T</span>
            </div>
            <div className="font-display text-[15px] font-bold uppercase tracking-[0.2em] text-graphite-200">
              TESIS <span className="text-signal-400">Observer</span>
            </div>
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-graphite-500 sm:inline">
              dvwa sandbox · read-only
            </span>
          </div>
          <nav className="flex items-center gap-1 font-display text-[12px] font-semibold uppercase tracking-wider text-graphite-500">
            <a href="/" className="hover:text-graphite-200">Live</a>
            <span className="mx-1 text-graphite-700">/</span>
            <a href="/" className="inline-flex items-center gap-1 text-graphite-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-confirm-400 shadow-glowconfirm" />
              Runtime
            </a>
          </nav>
        </header>
        <main className="canvas relative h-[calc(100%-41px)] overflow-hidden">{children}</main>
      </body>
    </html>
  );
}

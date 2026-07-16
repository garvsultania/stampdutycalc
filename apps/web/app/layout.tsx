import type { Metadata } from "next";
import { Inter, Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { Scale } from "lucide-react";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "StampDraft — India's stamp duty computation engine",
  description:
    "Deterministic, citation-backed stamp duty computation for Delhi, Maharashtra and Karnataka. Versioned law, historical mode, penalty ranges.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} ${mono.variable} font-sans min-h-screen flex flex-col`}>
        <header className="no-print sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
          <div className="container flex h-14 items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
                <Scale className="h-4 w-4" />
              </span>
              <span className="font-serif text-lg font-semibold tracking-tight">StampDraft</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/compute" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                Compute
              </Link>
              <Link href="/classify" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                Classify
              </Link>
              <Link href="/workspace" className="rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                Workspace
              </Link>
              <Link
                href="/compute"
                className="ml-2 rounded-md bg-primary px-3.5 py-1.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                New computation
              </Link>
            </nav>
          </div>
        </header>
        <div className="no-print border-b border-gold/30 bg-gold/10">
          <div className="container py-1.5 text-center text-xs font-medium text-gold">
            Beta — rule encodings are source-quoted drafts pending final legal verification. Every output carries its ruleset hash.
          </div>
        </div>
        <main className="flex-1">{children}</main>
        <footer className="no-print border-t py-8">
          <div className="container flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
            <p className="font-medium">StampDraft — computation reports, not legal opinions.</p>
            <p>Deterministic engine · Zero LLM in the computation path · Append-only versioned law</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

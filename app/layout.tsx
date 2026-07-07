import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// DESIGN_SYSTEM_CLAUDE_BLUE §3.1: Inter for UI, Source Serif 4 for display
// (one per screen), JetBrains Mono for ALL numerics. next/font self-hosts at
// build time — no request ever leaves our deployment. display stays "block"
// (deliberate deviation from §3.1's swap): ADJUDICATION R-8a — print must
// never capture fallback glyphs; fonts are local + preloaded so the block
// window is effectively zero.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "block",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "block",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "block",
});

export const metadata: Metadata = {
  title: "Invoice Ledger",
  description: "Invoice & customer ledger system",
};

// Applies the persisted theme before first paint to avoid a flash of
// the wrong theme. Runs inline in <head>; localStorage may be unavailable.
const themeInit = `
try {
  if (localStorage.getItem("theme") === "dark") document.documentElement.classList.add("dark");
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body
        className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

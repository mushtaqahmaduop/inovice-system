import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// D-21: Inter Tight for UI, JetBrains Mono for all numerics. No serif fonts.
// next/font self-hosts at build time — no request ever leaves our deployment.
const interTight = Inter_Tight({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
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
      <body className={`${interTight.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

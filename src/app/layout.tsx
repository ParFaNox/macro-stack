import type { Metadata } from "next";
import { Playfair_Display, Nunito, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "MacroStack AI — Autonomous Supplement Stack Optimizer",
  description: "Audit nutrition labels, compare true cost-per-gram across stores, and automate checkouts with Prava Virtual Cards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${nunito.variable} ${jetbrains.variable}`}>
      <body className="font-sans antialiased bg-[#08080a] text-[#f0f0f5]">
        {children}
      </body>
    </html>
  );
}

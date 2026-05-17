import type { Metadata } from "next";
import { Lekton } from "next/font/google";
import "./globals.css";

const lekton = Lekton({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-lekton",
});

export const metadata: Metadata = {
  title: "Research Agent",
  description: "AI-powered research briefs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${lekton.variable} font-lekton antialiased`}>
        {children}
      </body>
    </html>
  );
}

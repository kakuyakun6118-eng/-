import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "株価インパクト・アドバイザー",
  description: "ニュース/相場データをもとに今日のおすすめ銘柄と保有株の売り時を提案する個人用ツール",
  appleWebApp: {
    // Launched from the iOS home screen this opens without Safari's chrome.
    capable: true,
    title: "株アドバイザー",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Tints the iOS status bar area to match the app's accent colour.
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

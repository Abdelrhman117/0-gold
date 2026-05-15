import type { Metadata, Viewport } from "next";
import { Cairo, Tajawal } from "next/font/google";
import "./globals.css";

// ── Google Fonts (Arabic-optimised) ──────────────────────────────────────────
const cairo = Cairo({
  subsets:  ["arabic", "latin"],
  variable: "--font-cairo",
  display:  "swap",
});

const tajawal = Tajawal({
  subsets:  ["arabic"],
  variable: "--font-tajawal",
  weight:   ["400", "500", "700"],
  display:  "swap",
});

// ── Metadata ──────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default:  "0% — نظام نقاط البيع للذهب",
    template: "%s | 0%",
  },
  description: "نظام متكامل لإدارة محلات الذهب والمجوهرات — بدون خسائر.",
  manifest:    "/manifest.json",
  appleWebApp: {
    capable:    true,
    statusBarStyle: "black-translucent",
    title:      "0%",
  },
  formatDetection: { telephone: false },
  icons: {
    icon:  [{ url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192x192.png" }],
  },
};

export const viewport: Viewport = {
  themeColor:    "#036a71",
  width:         "device-width",
  initialScale:  1,
  maximumScale:  1,
};

// ── Root layout ───────────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body className={`${cairo.variable} ${tajawal.variable}`}>
        {children}
      </body>
    </html>
  );
}

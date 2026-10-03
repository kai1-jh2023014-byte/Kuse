import type { Metadata, Viewport } from "next";
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import { AppHeader } from "@/components/studio/app-header";
import { PwaRegister } from "@/components/studio/pwa-register";
import { StudioProvider } from "@/components/studio/studio-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Zen_Kaku_Gothic_New({
  variable: "--font-zen",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

const display = Shippori_Mincho({
  variable: "--font-shippori",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KUSE — 貼って、スライドにする",
  description: "原稿を貼ると枚に分け、Canvaで複数ページの発表を一度に作ります。写真は Canva の素材で入れます。",
  applicationName: "KUSE",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KUSE",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#241c16",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <StudioProvider>
          <PwaRegister />
          <AppHeader />
          <main>{children}</main>
        </StudioProvider>
        <Toaster theme="light" position="top-center" />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import { AppHeader } from "@/components/studio/app-header";
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
  title: "KUSE — デザインの癖をプロンプトに",
  description: "過去のデザインから自分の癖を読み取り、Canva AIに貼れる指示文を作ります。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <StudioProvider>
          <AppHeader />
          <main>{children}</main>
        </StudioProvider>
        <Toaster theme="light" position="top-center" />
      </body>
    </html>
  );
}

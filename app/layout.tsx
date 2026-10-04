import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { PwaShareRegistration } from "@/components/PwaShareRegistration";
import { FrontendProvider } from "@/components/frontend/FrontendProvider";
import { Shell } from "@/components/frontend/Shell";
import { FrontendBoundary } from "@/components/frontend/FrontendBoundary";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "DishDeals · Good food. A little less.",
    template: "%s · DishDeals",
  },
  description:
    "Food deals around Vancouver, shared by the people who find them.",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <PwaShareRegistration />
        <ConvexClientProvider>
          <FrontendBoundary>
            <FrontendProvider>
              <Shell>{children}</Shell>
            </FrontendProvider>
          </FrontendBoundary>
        </ConvexClientProvider>
      </body>
    </html>
  );
}

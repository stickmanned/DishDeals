import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { FrontendProvider } from "@/components/frontend/FrontendProvider";
import { Shell } from "@/components/frontend/Shell";
import { FrontendBoundary } from "@/components/frontend/FrontendBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Dinedeals · Good food. A little less.",
    template: "%s · Dinedeals",
  },
  description:
    "Food deals around Vancouver, shared by the people who find them.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
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

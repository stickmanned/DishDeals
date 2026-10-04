import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthControls } from "@/components/AuthControls";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DishDeals",
  description: "Community feed of Vancouver food deals",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>
          <AuthControls />
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BiteMap · 餐厅优惠地图",
  description: "在大温地区的地图上发现餐厅优惠。当前展示为示例数据。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}


import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "页缘",
  description: "起稿、改稿、存档。确认之前不把正文发给模型。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

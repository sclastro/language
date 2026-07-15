import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "英文對話練習 · English Tutor",
  description: "同 AI 用英文傾偈,即時糾正語法同用詞。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

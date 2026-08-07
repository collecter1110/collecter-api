import type { Metadata } from "next";
import "./globals.css";
import MetaPixel from "@/components/MetaPixel";

export const metadata: Metadata = {
  title: "Collecter",
  description: "Collecter에서 공유된 컬렉션",
  metadataBase: new URL("https://share.collecter.kr"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <MetaPixel />
        {children}
      </body>
    </html>
  );
}

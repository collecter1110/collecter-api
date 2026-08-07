import type { Metadata, Viewport } from "next";
import "./globals.css";
import MetaPixel from "@/components/MetaPixel";

export const metadata: Metadata = {
  title: "Collecter",
  description: "Collecter에서 공유된 컬렉션",
  metadataBase: new URL("https://share.collecter.kr"),
};

// 하단 CTA 가 홈 인디케이터를 피하려면 safe-area-inset 값이 필요하고,
// 그 값은 viewport-fit=cover 일 때만 0 이 아니다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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

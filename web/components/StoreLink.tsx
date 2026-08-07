"use client";

import { trackCustomEvent } from "@/lib/fbq";

type Props = {
  className?: string;
  children: React.ReactNode;
};

/** 스토어로 나가는 링크. 랜딩의 유일한 전환 지점이라 클릭을 픽셀로 남긴다. */
export default function StoreLink({ className, children }: Props) {
  const storeUrl = process.env.NEXT_PUBLIC_APP_STORE_URL ?? "#";

  return (
    <a
      href={storeUrl}
      className={className}
      onClick={() => trackCustomEvent("OpenInApp", { target: "app_store" })}
    >
      {children}
    </a>
  );
}

"use client";

import { useEffect, useState } from "react";
import { trackCustomEvent } from "@/lib/fbq";

type Props = {
  schemeUrl: string;
  source: "collection" | "selection";
  label?: string;
  contentType?: "product" | "product_group";
  contentId?: string;
};

export default function OpenInApp({
  schemeUrl,
  source,
  label = "앱에서 열기",
  contentType,
  contentId,
}: Props) {
  const [isIOS, setIsIOS] = useState<boolean | null>(null);

  useEffect(() => {
    setIsIOS(/iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  const storeUrl = process.env.NEXT_PUBLIC_APP_STORE_URL ?? "#";

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();

    // 공유 페이지의 유일한 전환 지점. iOS는 앱으로, 그 외는 스토어로 나간다.
    trackCustomEvent("OpenInApp", {
      source,
      target: isIOS ? "app_scheme" : "app_store",
      ...(contentType ? { content_type: contentType } : {}),
      ...(contentId ? { content_ids: [contentId] } : {}),
    });

    if (!isIOS) {
      window.open(storeUrl, "_blank", "noopener");
      return;
    }

    // iOS: custom scheme 시도 → 1.5s 안에 앱 응답 없으면 App Store로 폴백
    window.location.href = schemeUrl;

    const timer = setTimeout(() => {
      window.location.href = storeUrl;
    }, 1500);

    // 앱이 열리면 페이지가 숨겨짐 — 타이머 취소
    const cancel = () => clearTimeout(timer);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancel();
    }, { once: true });
    window.addEventListener("pagehide", cancel, { once: true });
  }

  // 서버 렌더 + 하이드레이션 전: 버튼 표시만 (클릭 시 동작은 hydration 후)
  const buttonLabel = isIOS === false ? "App Store에서 받기" : label;

  return (
    // 배경 바 없이 버튼만 떠 있는다. 뒤로 지나가는 본문과 구분되도록 그림자를 준다.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
      <div className="mx-auto max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <a
          href={schemeUrl}
          onClick={handleClick}
          className="pointer-events-auto flex w-full items-center justify-center gap-1.5 rounded-xl bg-black py-3.5 text-[15px] font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition-transform active:scale-[0.99]"
        >
          {buttonLabel}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </div>
  );
}

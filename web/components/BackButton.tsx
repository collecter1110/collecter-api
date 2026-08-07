"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  /** 돌아갈 히스토리가 없을 때 대신 갈 곳. 없으면 버튼 자체를 숨긴다. */
  fallbackHref?: string;
};

const ICON_CLASS =
  "absolute left-4 top-4 -m-2 p-2 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]";

/**
 * 헤더 좌상단 뒤로가기. 브라우저 뒤로가기와 같은 동작(history.back)을 하되,
 * 직전 항목이 우리 사이트일 때만 그렇게 한다. 공유 링크로 바로 들어온 방문자가
 * 눌렀을 때 사이트 밖(인스타·카톡 등)으로 튕겨나가면 안 되기 때문이다.
 */
export default function BackButton({ fallbackHref }: Props) {
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (window.history.length <= 1) return;

    // SPA 이동에서는 referrer 가 최초 진입 시점 그대로라 내부 이동을 못 잡는다.
    // 그때는 fallbackHref 로 가게 두면 되므로(목적지가 같다) 이 판정으로 충분하다.
    try {
      const ref = document.referrer;
      if (ref && new URL(ref).origin === window.location.origin) {
        setCanGoBack(true);
      }
    } catch {
      // referrer 가 파싱 불가한 값이면 그냥 폴백을 쓴다.
    }
  }, []);

  if (canGoBack) {
    return (
      <button
        type="button"
        aria-label="뒤로 가기"
        onClick={() => window.history.back()}
        className={ICON_CLASS}
      >
        <ChevronLeft />
      </button>
    );
  }

  if (!fallbackHref) return null;

  return (
    <Link href={fallbackHref} aria-label="뒤로 가기" className={ICON_CLASS}>
      <ChevronLeft />
    </Link>
  );
}

function ChevronLeft() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

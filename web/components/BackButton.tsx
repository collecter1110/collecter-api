"use client";

import { useEffect, useState } from "react";

/**
 * 헤더 좌상단 뒤로가기. 공유 링크로 바로 들어온 방문자는 돌아갈 곳이 없으므로,
 * 히스토리가 있을 때만 렌더해서 눌러도 아무 일 없는 버튼이 생기지 않게 한다.
 */
export default function BackButton() {
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  if (!canGoBack) return null;

  return (
    <button
      type="button"
      aria-label="뒤로 가기"
      onClick={() => window.history.back()}
      className="-m-2 p-2 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
    >
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
    </button>
  );
}

"use client";

import { useEffect } from "react";

type Props = {
  /** 뒤로가기로 도달시킬 상위 페이지 (셀렉션 → 부모 컬렉션) */
  href: string;
};

/**
 * 공유 링크로 셀렉션에 바로 들어오면 히스토리가 비어 있어서 브라우저(카카오톡·인스타
 * 인앱 브라우저 포함) 뒤로가기가 앱 밖으로 나가버린다. 부모 컬렉션을 이전 항목으로
 * 하나 심어 뒤로가기가 컬렉션으로 가게 한다.
 *
 * 사이트 안에서 넘어온 경우엔 진짜 히스토리가 이미 있으므로 아무것도 하지 않는다.
 */
export default function ParentHistoryEntry({ href }: Props) {
  useEffect(() => {
    let internal = false;
    try {
      const ref = document.referrer;
      internal = !!ref && new URL(ref).origin === window.location.origin;
    } catch {
      // referrer 가 파싱 불가하면 외부 진입으로 본다.
    }
    if (internal || window.history.length > 1) return;

    // 현재 항목을 부모로 바꾼 뒤 현재 URL 을 다시 쌓아 [부모, 현재] 스택을 만든다.
    // Next 라우터가 들고 있는 state 는 그대로 유지해야 라우터가 혼란스러워하지 않는다.
    const current = window.location.href;
    const state = window.history.state;
    window.history.replaceState(state, "", href);
    window.history.pushState(state, "", current);

    // 같은 문서 안에서의 pop 이라 실제 이동은 직접 시킨다.
    const onPopState = () => {
      window.location.href = href;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [href]);

  return null;
}

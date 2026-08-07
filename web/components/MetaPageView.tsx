"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { flushPending, trackEvent } from "@/lib/fbq";

/** 클라이언트 라우팅(Link 이동) PageView. 기본 코드는 그때 재실행되지 않는다. */
export default function MetaPageView() {
  const pathname = usePathname();
  const mounted = useRef(false);

  useEffect(() => {
    // 첫 진입 PageView는 기본 코드가 이미 보냈으므로 건너뛴다.
    if (!mounted.current) {
      mounted.current = true;
      flushPending();
      return;
    }

    trackEvent("PageView");
  }, [pathname]);

  return null;
}

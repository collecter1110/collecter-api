"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/fbq";

type Props = {
  contentType: "product" | "product_group";
  contentId: string;
  contentName: string;
  contentCategory?: string;
};

/** 서버 컴포넌트 페이지에서 ViewContent 하나를 쏘기 위한 렌더 없는 컴포넌트. */
export default function MetaViewContent({
  contentType,
  contentId,
  contentName,
  contentCategory,
}: Props) {
  useEffect(() => {
    trackEvent("ViewContent", {
      content_type: contentType,
      content_ids: [contentId],
      content_name: contentName,
      ...(contentCategory ? { content_category: contentCategory } : {}),
    });
  }, [contentType, contentId, contentName, contentCategory]);

  return null;
}

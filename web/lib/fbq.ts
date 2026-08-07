// Meta 픽셀(fbq) 호출을 감싸는 얇은 래퍼.
//
// 기본 코드가 <body> 최상단에서 파싱 중 실행되므로 하이드레이션 시점엔 이미
// window.fbq가 있다. 그 전제가 깨져도 이벤트가 조용히 사라지지 않도록,
// fbq가 없으면 잠깐 모아뒀다가 flushPending에서 내보낸다.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

type Method = "track" | "trackCustom";
type PendingCall = [Method, string, Record<string, unknown>?];

const pending: PendingCall[] = [];

function send(method: Method, name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;

  if (!window.fbq) {
    pending.push([method, name, params]);
    return;
  }

  window.fbq(method, name, params);
}

/** 픽셀 로드 전에 쌓인 이벤트를 내보낸다. 픽셀이 아직 없으면 그대로 둔다. */
export function flushPending() {
  if (typeof window === "undefined" || !window.fbq) return;

  while (pending.length > 0) {
    const [method, name, params] = pending.shift() as PendingCall;
    window.fbq(method, name, params);
  }
}

/** Meta 표준 이벤트 (PageView, ViewContent 등) */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  send("track", name, params);
}

/** 커스텀 이벤트 — 광고 관리자에서 맞춤 전환으로 만들어 쓴다. */
export function trackCustomEvent(
  name: string,
  params?: Record<string, unknown>
) {
  send("trackCustom", name, params);
}

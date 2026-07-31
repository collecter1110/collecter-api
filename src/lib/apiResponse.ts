import { NextResponse } from "next/server";

// 인증 응답에는 유저별 상태(has_liked 등)가 섞여 있다. 중간 프록시나 클라이언트
// HTTP 캐시가 이를 재사용하면 다른 계정의 상태가 노출될 수 있으므로 캐시를 막는다.
// 공개(비인증) 라우트는 lib/publicResponse.ts 의 캐시 정책을 따로 쓴다.
const NO_STORE = "private, no-store";

export function apiResponse(data: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json(
    { errorCode: "SU000", msg: "ok", data },
    { status, headers: { "Cache-Control": NO_STORE } }
  );
}

export function apiError(msg: string, status = 400, errorCode = "SU000") {
  return NextResponse.json(
    { errorCode, msg, data: {} },
    { status, headers: { "Cache-Control": NO_STORE } }
  );
}

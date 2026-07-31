import { NextRequest, NextResponse } from "next/server";
import { verifyJwt, type AccessTokenClaims } from "./jwt";
import { touchLastActive } from "./lastActive";

export interface AuthContext {
  userId: number;
  email: string;
  name: string;
  accessToken: string;
}

/**
 * 인증 헤더 해석 결과.
 *
 * - anonymous: Authorization 헤더가 아예 없음 = 비로그인. 정상적인 익명 요청이다.
 * - invalid:   헤더는 있으나 만료·변조·타입 불일치. 로그인한 클라이언트의 토큰이 죽은 상태다.
 * - ok:        검증 통과.
 *
 * 이 둘을 구분하지 않으면 만료 토큰이 익명 요청처럼 200으로 처리되어,
 * 클라이언트의 401 기반 토큰 갱신이 영원히 발동하지 않는다.
 */
export type AuthResult =
  | { status: "anonymous" }
  | { status: "invalid" }
  | { status: "ok"; auth: AuthContext };

export async function resolveAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  // 헤더 자체가 없거나 값이 비어 있으면 자격증명을 제시하지 않은 것으로 본다.
  if (!authHeader || authHeader.trim() === "") return { status: "anonymous" };

  // 헤더를 보냈다면 형식이 깨졌더라도 "인증하려다 실패한 것"이므로 익명으로 강등하지 않는다.
  if (!authHeader.startsWith("Bearer ")) return { status: "invalid" };

  const token = authHeader.slice(7).trim();
  if (token === "") return { status: "invalid" };

  let claims: AccessTokenClaims;
  try {
    claims = await verifyJwt<AccessTokenClaims>(token);
  } catch {
    return { status: "invalid" };
  }

  if (!claims || claims.typ !== "access") return { status: "invalid" };
  if (!claims.user_id || !claims.email || !claims.name) return { status: "invalid" };

  // Not awaited: a failed or slow write must never cost the caller a request.
  touchLastActive(claims.user_id);

  return {
    status: "ok",
    auth: {
      userId: claims.user_id,
      email: claims.email,
      name: claims.name ?? "",
      accessToken: token,
    },
  };
}

export async function getAuthContext(
  request: NextRequest
): Promise<AuthContext | null> {
  const result = await resolveAuth(request);
  return result.status === "ok" ? result.auth : null;
}

export function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function requireAuth(
  request: NextRequest
): Promise<AuthContext | NextResponse> {
  const result = await resolveAuth(request);
  if (result.status !== "ok") return unauthorized();
  return result.auth;
}

/**
 * 인증이 선택적인 라우트용. 비로그인은 null 로 통과시키고,
 * 토큰이 있는데 무효하면 401 을 돌려 클라이언트가 갱신하도록 만든다.
 *
 * requireAuth 와 같은 호출 규약을 쓴다:
 *   const auth = await optionalAuth(request);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth: AuthContext | null
 */
export async function optionalAuth(
  request: NextRequest
): Promise<AuthContext | null | NextResponse> {
  const result = await resolveAuth(request);
  if (result.status === "invalid") return unauthorized();
  return result.status === "ok" ? result.auth : null;
}

import { createRemoteJWKSet, jwtVerify } from "jose";

// 구글 ID 토큰 검증용 공개키 (JWKS) — 모듈 로드 시 1회 생성하여 jose가 키를 캐싱
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleProfile = {
  sub: string; // 구글 계정 고유 ID
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

// iOS/Android/Web 클라이언트마다 client_id가 다를 수 있어 콤마로 여러 개 허용
function getGoogleClientIds(): string[] {
  const raw = process.env.GOOGLE_CLIENT_IDS ?? process.env.GOOGLE_CLIENT_ID;
  if (!raw) throw new Error("Missing GOOGLE_CLIENT_ID(S)");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// 네이티브 Google Sign-In SDK가 발급한 id_token을 구글 공개키로 검증하고 프로필을 반환
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const audience = getGoogleClientIds();
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUERS,
    audience,
  });

  const email = payload.email as string | undefined;
  if (!email) throw new Error("Google id_token missing email");

  return {
    sub: String(payload.sub),
    email,
    email_verified: payload.email_verified === true || payload.email_verified === "true",
    name: payload.name as string | undefined,
    picture: payload.picture as string | undefined,
  };
}

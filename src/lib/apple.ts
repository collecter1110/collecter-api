import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const APPLE_ISSUER = "https://appleid.apple.com";

export type AppleProfile = {
  sub: string; // Apple User ID — 불변 식별자
  email?: string; // 첫 로그인만 존재, 이후 undefined
};

function getAppleBundleId(): string {
  const bundleId = process.env.APPLE_APP_BUNDLE_ID;
  if (!bundleId) throw new Error("Missing APPLE_APP_BUNDLE_ID");
  return bundleId;
}

export async function verifyAppleIdToken(identityToken: string): Promise<AppleProfile> {
  const audience = getAppleBundleId();
  const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
    issuer: APPLE_ISSUER,
    audience,
  });

  if (!payload.sub) throw new Error("Apple identity_token missing sub");

  return {
    sub: String(payload.sub),
    email: payload.email as string | undefined,
  };
}

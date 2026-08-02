import { SignJWT, jwtVerify } from "jose";

function getSecretKeys() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) throw new Error("Missing AUTH_JWT_SECRET");

  const encoder = new TextEncoder();
  const keys = secret
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => encoder.encode(s));

  if (keys.length === 0) throw new Error("Missing AUTH_JWT_SECRET");
  return keys;
}

function getSigningKey() {
  return getSecretKeys()[0];
}

export type AccessTokenClaims = {
  typ: "access";
  user_id: number;
  email: string;
  name: string;
};

export type RefreshTokenClaims = {
  typ: "refresh";
  sid: string; // session id
  user_id: number;
  email: string;
  name: string;
};

export type VerifiedTokenClaims = {
  typ: "verified";
  user_id: number;
  email: string;
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export async function signAccessToken(payload: AccessTokenClaims) {
  const ttl = Number(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS ?? 900);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSeconds())
    .setExpirationTime(nowSeconds() + ttl)
    .sign(getSigningKey());
}

export async function signRefreshToken(payload: RefreshTokenClaims) {
  const ttl = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSeconds())
    .setExpirationTime(nowSeconds() + ttl)
    .sign(getSigningKey());
}

export async function signVerifiedToken(payload: VerifiedTokenClaims) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSeconds())
    .setExpirationTime(nowSeconds() + 180) // 3분
    .sign(getSigningKey());
}

export async function verifyJwt<T extends object>(token: string) {
  const { payload } = await verifyJwtWithKeyIndex(token);
  return payload as unknown as T & { exp?: number; iat?: number };
}

export async function verifyJwtWithKeyIndex(token: string) {
  let lastError: unknown;

  for (const [keyIndex, key] of getSecretKeys().entries()) {
    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
      return { payload, keyIndex };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

import { SignJWT, jwtVerify } from "jose";

function getSecretKey() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) throw new Error("Missing AUTH_JWT_SECRET");
  return new TextEncoder().encode(secret);
}

export type AccessTokenClaims = {
  typ: "access";
  user_id: number;
  email: string;
};

export type RefreshTokenClaims = {
  typ: "refresh";
  sid: string; // session id
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
    .sign(getSecretKey());
}

export async function signRefreshToken(payload: RefreshTokenClaims) {
  const ttl = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSeconds())
    .setExpirationTime(nowSeconds() + ttl)
    .sign(getSecretKey());
}

export async function verifyJwt<T extends object>(token: string) {
  const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
  return payload as unknown as T & { exp?: number; iat?: number };
}


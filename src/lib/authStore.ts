import crypto from "crypto";
import { getSupabase } from "./supabase";

// 회전된 세션을 몇 초간 더 받아줄지. 잘못된 값이 들어오면 NaN 이 되어 유예 만료
// 비교(`... > NaN`)가 항상 false 가 되고, 회전된 토큰이 expires_at 까지 살아남아
// 로테이션이 통째로 무력화된다. 그래서 유한한 음이 아닌 수만 받는다.
// 빈 문자열은 미설정으로 본다. `?? 60` 은 "" 를 통과시키고 Number("") 는 0 이라,
// 변수만 선언하고 값을 비워두면 유예가 0 초가 되어 수정이 조용히 무력화된다.
const DEFAULT_ROTATION_GRACE_SECONDS = 60;
const rawRotationGrace = process.env.AUTH_REFRESH_ROTATION_GRACE_SECONDS?.trim();
const rotationGraceSeconds = rawRotationGrace
  ? Number(rawRotationGrace)
  : DEFAULT_ROTATION_GRACE_SECONDS;
const REFRESH_ROTATION_GRACE_MS =
  (Number.isFinite(rotationGraceSeconds) && rotationGraceSeconds >= 0
    ? rotationGraceSeconds
    : DEFAULT_ROTATION_GRACE_SECONDS) * 1000;

/* ─── OTP Rate Limit (in-memory) ─── */

const OTP_SEND_WINDOW_MS = 60_000; // 이메일당 발송 윈도우 60초
const OTP_SEND_MAX_ATTEMPTS = 3; // 윈도우당 최대 발송 횟수
const OTP_VERIFY_MAX_ATTEMPTS = 5; // 이메일당 최대 검증 시도 횟수
const OTP_VERIFY_WINDOW_MS = 10 * 60_000; // 검증 윈도우 10분

const otpSendAttempts = new Map<string, { count: number; firstAt: number }>();
const otpVerifyAttempts = new Map<string, { count: number; firstAt: number }>();

export function checkOtpSendRateLimit(email: string): { allowed: boolean; retryAfterSeconds?: number } {
  const key = email.toLowerCase();
  const now = Date.now();
  const record = otpSendAttempts.get(key);

  if (!record || now - record.firstAt >= OTP_SEND_WINDOW_MS) {
    otpSendAttempts.set(key, { count: 1, firstAt: now });
    return { allowed: true };
  }

  if (record.count >= OTP_SEND_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((OTP_SEND_WINDOW_MS - (now - record.firstAt)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  record.count++;
  return { allowed: true };
}

export function checkOtpVerifyRateLimit(email: string): { allowed: boolean } {
  const key = email.toLowerCase();
  const now = Date.now();
  const record = otpVerifyAttempts.get(key);

  if (!record || now - record.firstAt > OTP_VERIFY_WINDOW_MS) {
    otpVerifyAttempts.set(key, { count: 1, firstAt: now });
    return { allowed: true };
  }

  if (record.count >= OTP_VERIFY_MAX_ATTEMPTS) {
    return { allowed: false };
  }

  record.count++;
  return { allowed: true };
}

export function resetOtpVerifyRateLimit(email: string) {
  otpVerifyAttempts.delete(email.toLowerCase());
}

/* ─── Types ─── */

export type OtpIntent = {
  email: string;
  create_user: boolean;
  code: string;
  expires_at: string;
};

export function randomOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Keyed hash for the OTP. A plain SHA-256 of email|code is brute-forceable:
// the email sits in the same row and the code is only 6 digits (1M values), so
// anyone holding the hash can recover the code in milliseconds. HMAC folds in a
// server-only secret, so a stolen DB is useless without AUTH_JWT_SECRET.
function hmacSha256(input: string) {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) throw new Error("Missing AUTH_JWT_SECRET");
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

export function hashOtp(email: string, code: string) {
  return hmacSha256(`otp|${email.toLowerCase()}|${code}`);
}

export function hashRefreshToken(token: string) {
  return sha256(`refresh|${token}`);
}

export async function saveOtpIntent(params: {
  email: string;
  create_user: boolean;
  code: string;
  expiresAt: Date;
}) {
  const { email, create_user, code, expiresAt } = params;

  const { error } = await getSupabase().from("auth_otp").insert({
    email: email.toLowerCase(),
    code_hash: hashOtp(email, code),
    create_user,
    expires_at: expiresAt.toISOString(),
    used_at: null,
  });

  if (error) throw error;
}

export async function consumeOtp(params: { email: string; code: string }) {
  const email = params.email.toLowerCase();
  const codeHash = hashOtp(email, params.code);

  const { data, error } = await getSupabase()
    .from("auth_otp")
    .select("id, email, create_user, expires_at, used_at")
    .eq("email", email)
    .eq("code_hash", codeHash)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const expiresAt = new Date(data.expires_at);
  if (data.used_at) return null;
  if (expiresAt.getTime() < Date.now()) return null;

  const { error: updError } = await getSupabase()
    .from("auth_otp")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id);

  if (updError) throw updError;

  return { email: data.email as string, create_user: Boolean(data.create_user) };
}

export async function getOrCreateUserIdByEmail(params: {
  email: string;
  createIfMissing: boolean;
}): Promise<{ userId: number; terms_agreed: boolean } | null> {
  const email = params.email.toLowerCase();
  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id, terms_agreed")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  if (data?.user_id) return { userId: data.user_id as number, terms_agreed: Boolean(data.terms_agreed) };
  if (!params.createIfMissing) return null;

  const userId = await insertUserWithDefaultName(email);
  return { userId, terms_agreed: false };
}

// 신규 유저를 생성하고 기본 이름 '뉴비_{userId}'로 설정한다.
// name 컬럼은 NOT NULL + UNIQUE이므로 임시 UUID 이름으로 insert 후 바로 update한다.
async function insertUserWithDefaultName(email: string): Promise<number> {
  const temp = `_tmp_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const insertRes = await getSupabase()
    .from("userinfo")
    .insert({ email, name: temp, description: null, image_id: null })
    .select("user_id")
    .single();
  if (insertRes.error) throw insertRes.error;

  const userId = insertRes.data.user_id as number;
  await getSupabase()
    .from("userinfo")
    .update({ name: `뉴비_${userId}` })
    .eq("user_id", userId);

  return userId;
}

// OAuth(구글 등) 로그인용: 이메일로 유저를 찾기만 하고 없으면 null 반환 (생성하지 않음)
export async function findUserByEmail(email: string): Promise<{ userId: number } | null> {
  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) return null;
  return { userId: data.user_id as number };
}

// Apple OAuth 로그인용: apple_user_id(sub)로 유저를 찾고 없으면 생성, 신규 여부와 저장된 이메일 반환
export async function findOrCreateUserByAppleId(params: {
  appleUserId: string;
  email?: string;
}): Promise<{ userId: number; isNew: boolean; email: string; terms_agreed: boolean }> {
  const { appleUserId, email } = params;

  // 1. 기존 apple_accounts 조회 — userinfo.terms_agreed 를 임베디드 조인으로 한 번에 가져와 왕복 1회로 처리
  const { data: appleAccount, error: appleError } = await getSupabase()
    .from("apple_accounts")
    .select("user_id, email, userinfo(terms_agreed)")
    .eq("apple_user_id", appleUserId)
    .maybeSingle();

  if (appleError) throw appleError;
  if (appleAccount?.user_id) {
    const joined = appleAccount.userinfo as { terms_agreed?: boolean } | { terms_agreed?: boolean }[] | null;
    const userRow = Array.isArray(joined) ? joined[0] : joined;
    return {
      userId: appleAccount.user_id as number,
      isNew: false,
      email: appleAccount.email as string,
      terms_agreed: Boolean(userRow?.terms_agreed),
    };
  }

  // 2. 신규 유저 — 첫 로그인이므로 email 필요
  if (!email) throw new Error("email required for new Apple user");

  const normalizedEmail = email.toLowerCase();

  // 3. 같은 이메일의 기존 userinfo가 있으면 연결, 없으면 생성
  const { data: existing, error: existingError } = await getSupabase()
    .from("userinfo")
    .select("user_id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingError) throw existingError;

  let userId: number;
  let isNew: boolean;

  if (existing?.user_id) {
    userId = existing.user_id as number;
    isNew = false;
  } else {
    userId = await insertUserWithDefaultName(normalizedEmail);
    isNew = true;
  }

  // 4. apple_accounts 레코드 생성
  const { error: insertError } = await getSupabase()
    .from("apple_accounts")
    .insert({ apple_user_id: appleUserId, user_id: userId, email: normalizedEmail });

  if (insertError) throw insertError;

  return { userId, isNew, email: normalizedEmail, terms_agreed: false };
}

// OAuth(구글 등) 로그인용: 이메일로 유저를 찾고 없으면 생성하며, 신규 생성 여부와 약관 동의 여부를 함께 반환
export async function findOrCreateUserByEmail(params: {
  email: string;
  name?: string | null;
}): Promise<{ userId: number; isNew: boolean; terms_agreed: boolean }> {
  const email = params.email.toLowerCase();
  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id, terms_agreed")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  if (data?.user_id) return { userId: data.user_id as number, isNew: false, terms_agreed: Boolean(data.terms_agreed) };

  const userId = await insertUserWithDefaultName(email);
  return { userId, isNew: true, terms_agreed: false };
}

export async function createRefreshSession(params: {
  session_id: string;
  user_id: number;
  email: string;
  refresh_token: string;
  expiresAt: Date;
  /** 갱신으로 파생된 세션이면 원본의 체인 id. 로그인이면 생략한다. */
  chain_id?: string;
}) {
  const { error } = await getSupabase().from("auth_refresh_sessions").insert({
    id: params.session_id,
    user_id: params.user_id,
    email: params.email.toLowerCase(),
    refresh_token_hash: hashRefreshToken(params.refresh_token),
    revoked_at: null,
    rotated_at: null,
    // 로그인으로 처음 생긴 세션은 자기 자신이 체인의 뿌리다.
    chain_id: params.chain_id ?? params.session_id,
    expires_at: params.expiresAt.toISOString(),
  });
  if (error) throw error;
}

/**
 * 로그아웃: 제시된 토큰이 속한 회전 체인 전체를 폐기한다.
 *
 * 유예 창 안에서 동시에 들어온 갱신 요청은 각자 새 세션을 만들기 때문에, 앱이
 * 실제로 보관하는 토큰은 그중 하나뿐이고 나머지는 아무도 안 쓰는 채로 살아있다.
 * 제시된 토큰 하나만 폐기하면 그 형제 세션들이 만료일까지 유효하게 남는다.
 * 체인 단위로 지워야 로그아웃이 실제로 로그아웃이 된다.
 *
 * 같은 유저의 다른 기기는 로그인 시점에 별도 체인을 받으므로 영향받지 않는다.
 */
export async function revokeRefreshChainByToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const { data, error } = await getSupabase()
    .from("auth_refresh_sessions")
    .select("id, chain_id")
    .eq("refresh_token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  const chainId = (data.chain_id as string | null) ?? (data.id as string);
  // chain_id 도입 이전에 만들어진 행은 chain_id 가 비어 있어 chain_id 매칭에
  // 걸리지 않는다. 그 행 자신도 id 로 함께 지운다.
  const { error: updError } = await getSupabase()
    .from("auth_refresh_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .or(`chain_id.eq.${chainId},id.eq.${chainId}`)
    .is("revoked_at", null);
  if (updError) throw updError;
}

export async function rotateRefreshSessionById(sessionId: string) {
  const { error } = await getSupabase()
    .from("auth_refresh_sessions")
    .update({ rotated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("revoked_at", null)
    .is("rotated_at", null);
  if (error) throw error;
}

/**
 * 유효한 세션이면 체인 id 를, 아니면 null 을 돌려준다.
 * 갱신 시 새 세션이 같은 체인을 이어받아야 하므로 검증과 체인 조회를 한 번의
 * 왕복으로 처리한다.
 */
export async function getValidRefreshSession(params: {
  session_id: string;
  refresh_token: string;
}): Promise<{ chain_id: string } | null> {
  const tokenHash = hashRefreshToken(params.refresh_token);
  const { data, error } = await getSupabase()
    .from("auth_refresh_sessions")
    .select("id, chain_id, revoked_at, rotated_at, expires_at, refresh_token_hash")
    .eq("id", params.session_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.revoked_at) return null;
  if (String(data.refresh_token_hash) !== tokenHash) return null;
  if (new Date(String(data.expires_at)).getTime() < Date.now()) return null;
  // 회전된 세션도 유예 시간 안이면 받아준다. 만료된 access 토큰으로 여러 요청이
  // 동시에 401 을 받으면 같은 refresh 토큰으로 갱신이 중복 호출되는데, 여기서
  // 즉시 거절하면 늦게 도착한 요청이 401 을 받아 앱이 로그아웃해버린다.
  if (data.rotated_at) {
    const rotatedAt = new Date(String(data.rotated_at)).getTime();
    if (!Number.isFinite(rotatedAt)) return null;
    if (Date.now() - rotatedAt > REFRESH_ROTATION_GRACE_MS) return null;
  }
  return { chain_id: (data.chain_id as string | null) ?? (data.id as string) };
}

export function newSessionId() {
  return crypto.randomUUID();
}

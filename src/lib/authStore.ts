import crypto from "crypto";
import { getSupabase } from "./supabase";

/* ─── OTP Rate Limit (in-memory) ─── */

const OTP_SEND_INTERVAL_MS = 60_000; // 이메일당 발송 간격 60초
const OTP_VERIFY_MAX_ATTEMPTS = 5; // 이메일당 최대 검증 시도 횟수
const OTP_VERIFY_WINDOW_MS = 10 * 60_000; // 검증 윈도우 10분

const otpSendTimestamps = new Map<string, number>();
const otpVerifyAttempts = new Map<string, { count: number; firstAt: number }>();

export function checkOtpSendRateLimit(email: string): { allowed: boolean; retryAfterSeconds?: number } {
  const key = email.toLowerCase();
  const now = Date.now();
  const lastSent = otpSendTimestamps.get(key);

  if (lastSent && now - lastSent < OTP_SEND_INTERVAL_MS) {
    const retryAfterSeconds = Math.ceil((OTP_SEND_INTERVAL_MS - (now - lastSent)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  otpSendTimestamps.set(key, now);
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

export function hashOtp(email: string, code: string) {
  return sha256(`${email.toLowerCase()}|${code}`);
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
}) {
  const email = params.email.toLowerCase();
  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  if (data?.user_id) return data.user_id as number;
  if (!params.createIfMissing) return null;

  return await insertUserWithDefaultName(email);
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

// OAuth(구글 등) 로그인용: 이메일로 유저를 찾고 없으면 생성하며, 신규 생성 여부를 함께 반환
export async function findOrCreateUserByEmail(params: {
  email: string;
  name?: string | null;
}): Promise<{ userId: number; isNew: boolean }> {
  const email = params.email.toLowerCase();
  const { data, error } = await getSupabase()
    .from("userinfo")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  if (data?.user_id) return { userId: data.user_id as number, isNew: false };

  const userId = await insertUserWithDefaultName(email);
  return { userId, isNew: true };
}

export async function createRefreshSession(params: {
  session_id: string;
  user_id: number;
  email: string;
  refresh_token: string;
  expiresAt: Date;
}) {
  const { error } = await getSupabase().from("auth_refresh_sessions").insert({
    id: params.session_id,
    user_id: params.user_id,
    email: params.email.toLowerCase(),
    refresh_token_hash: hashRefreshToken(params.refresh_token),
    revoked_at: null,
    expires_at: params.expiresAt.toISOString(),
  });
  if (error) throw error;
}

export async function revokeRefreshSessionByToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const { error } = await getSupabase()
    .from("auth_refresh_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("refresh_token_hash", tokenHash)
    .is("revoked_at", null);
  if (error) throw error;
}

export async function revokeRefreshSessionById(sessionId: string) {
  const { error } = await getSupabase()
    .from("auth_refresh_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("revoked_at", null);
  if (error) throw error;
}

export async function isRefreshSessionValid(params: { session_id: string; refresh_token: string }) {
  const tokenHash = hashRefreshToken(params.refresh_token);
  const { data, error } = await getSupabase()
    .from("auth_refresh_sessions")
    .select("id, revoked_at, expires_at, refresh_token_hash")
    .eq("id", params.session_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;
  if (data.revoked_at) return false;
  if (String(data.refresh_token_hash) !== tokenHash) return false;
  if (new Date(String(data.expires_at)).getTime() < Date.now()) return false;
  return true;
}

export function newSessionId() {
  return crypto.randomUUID();
}


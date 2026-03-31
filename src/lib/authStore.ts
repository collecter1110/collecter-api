import crypto from "crypto";
import { getSupabase } from "./supabase";

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

  // TODO: userinfo.user_id → useridentify FK 제약 제거 후 이 블록 삭제 (auth.users/useridentify 의존 제거)
  // 1. useridentify에서 기존 행 조회 (user_id까지 한번에)
  const { data: existingIdentify, error: existingIdentifyError } = await getSupabase()
    .from("useridentify")
    .select("uuid, user_id")
    .eq("email", email)
    .maybeSingle();
  if (existingIdentifyError) throw existingIdentifyError;

  let userId: number;

  if (existingIdentify) {
    // useridentify에 이미 있으면 user_id 재사용
    userId = existingIdentify.user_id as number;
  } else {
    // 2. useridentify에 없으면 auth.users에 유저 생성(또는 기존 UUID 조회) 후 insert
    let uuid: string;
    const { data: authUser, error: authError } = await getSupabase().auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (authError) {
      if (authError.code !== "email_exists") throw authError;
      // auth.users에 이미 있지만 useridentify엔 없는 경우 — 페이지 순회하며 UUID 조회
      let existing: { id: string } | undefined;
      let page = 1;
      while (!existing) {
        const { data: userList, error: listError } = await getSupabase().auth.admin.listUsers({ page, perPage: 500 });
        if (listError) throw listError;
        if (userList.users.length === 0) break;
        existing = userList.users.find((u) => u.email?.toLowerCase() === email);
        page++;
      }
      if (!existing) throw new Error(`auth.users lookup failed for ${email}`);
      uuid = existing.id;
    } else {
      uuid = authUser.user.id;
    }

    const identifyRes = await getSupabase()
      .from("useridentify")
      .insert({ uuid, email })
      .select("user_id")
      .single();
    if (identifyRes.error) throw identifyRes.error;
    userId = identifyRes.data.user_id as number;
  }

  // 3. userinfo에 insert
  const insertRes = await getSupabase()
    .from("userinfo")
    .insert({ user_id: userId, email, name: email.split("@")[0], description: null, image_file_path: null })
    .select("user_id")
    .single();
  if (insertRes.error) throw insertRes.error;

  return insertRes.data.user_id as number;
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


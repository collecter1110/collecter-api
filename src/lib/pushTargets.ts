import { getSupabase } from "./supabase";
import type { PushType } from "./fcm";

export interface PushTarget {
  userId: number;
  type: PushType;
  /** The user's newest collection — the deep link for the types that mention one. */
  collectionId?: number;
}

const PAGE = 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * PostgREST caps a response at 1000 rows and says nothing about it, so any
 * unbounded select has to be paged or it silently drops real targets.
 */
async function fetchAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

interface UserRow {
  user_id: number;
  created_at: string;
}
interface CollectionRow {
  id: number;
  user_id: number;
  created_at: string;
}
interface SelectionRow {
  user_id: number;
  created_at: string;
}
interface LogRow {
  user_id: number;
  type: string;
  created_at: string;
}

/** Newest row per user, by created_at. */
function latestByUser<T extends { user_id: number; created_at: string }>(
  rows: T[]
): Map<number, T> {
  const out = new Map<number, T>();
  for (const r of rows) {
    const cur = out.get(r.user_id);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) {
      out.set(r.user_id, r);
    }
  }
  return out;
}

/**
 * Picks at most one push per user.
 *
 * The four conditions are mutually exclusive by construction — 0 collections /
 * collections but 0 selections / has both and idle 3–7d / has both and idle 7d+
 * — so there is no priority rule to get wrong. The d3 and d7 windows are split
 * rather than both open-ended, which is what keeps a long-dormant user from
 * matching d3 and d7 at once.
 */
export async function resolveTargets(now: Date = new Date()): Promise<PushTarget[]> {
  const db = getSupabase();

  const [users, collections, selections, logs] = await Promise.all([
    fetchAll<UserRow>((from, to) =>
      db
        .from("userinfo")
        .select("user_id, created_at")
        .is("deleted_at", null)
        .eq("push_enabled", true)
        .order("user_id", { ascending: true })
        .range(from, to)
    ),
    fetchAll<CollectionRow>((from, to) =>
      db
        .from("collections")
        .select("id, user_id, created_at")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    // "셀렉션" here is a selection *filed into a collection* — that is the act
    // the copy asks for ("담아볼까요"), and it also covers selections the user
    // pulled in from someone else.
    fetchAll<SelectionRow>((from, to) =>
      db
        .from("collection_selections")
        .select("user_id, created_at")
        .order("selection_id", { ascending: true })
        .range(from, to)
    ),
    fetchAll<LogRow>((from, to) =>
      db
        .from("push_logs")
        .select("user_id, type, created_at")
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const collectionCount = new Map<number, number>();
  for (const c of collections) {
    collectionCount.set(c.user_id, (collectionCount.get(c.user_id) ?? 0) + 1);
  }
  const latestCollection = latestByUser(collections);

  const selectionCount = new Map<number, number>();
  for (const s of selections) {
    selectionCount.set(s.user_id, (selectionCount.get(s.user_id) ?? 0) + 1);
  }
  const latestSelection = latestByUser(selections);

  // Onboarding types are once per lifetime.
  const everSent = new Set<string>();
  // d3/d7 are once per dormancy streak: a log only counts if it went out after
  // the user's most recent selection. Come back, add something, go quiet again
  // and the clock starts over.
  const latestLogAt = new Map<string, number>();
  for (const l of logs) {
    everSent.add(`${l.user_id}:${l.type}`);
    const key = `${l.user_id}:${l.type}`;
    const at = Date.parse(l.created_at);
    if (at > (latestLogAt.get(key) ?? 0)) latestLogAt.set(key, at);
  }

  const sentSinceLastSelection = (userId: number, type: PushType, lastSelectionAt: number) =>
    (latestLogAt.get(`${userId}:${type}`) ?? 0) > lastSelectionAt;

  const t = now.getTime();
  const targets: PushTarget[] = [];

  for (const user of users) {
    const uid = user.user_id;
    const cols = collectionCount.get(uid) ?? 0;
    const sels = selectionCount.get(uid) ?? 0;

    // ① 가입 24h 경과 + 컬렉션 0개 — 평생 1회
    if (cols === 0) {
      if (t - Date.parse(user.created_at) < DAY) continue;
      if (everSent.has(`${uid}:onboarding_no_collection`)) continue;
      targets.push({ userId: uid, type: "onboarding_no_collection" });
      continue;
    }

    const newestCollection = latestCollection.get(uid);

    // ② 컬렉션 있고 셀렉션 0개, 최근 컬렉션 6h 경과 — 평생 1회
    if (sels === 0) {
      if (!newestCollection) continue;
      if (t - Date.parse(newestCollection.created_at) < 6 * HOUR) continue;
      if (everSent.has(`${uid}:onboarding_no_selection`)) continue;
      targets.push({
        userId: uid,
        type: "onboarding_no_selection",
        collectionId: newestCollection.id,
      });
      continue;
    }

    // ③④ 컬렉션·셀렉션 모두 있음 — 마지막 셀렉션 이후 경과 시간으로 갈림
    const lastSelection = latestSelection.get(uid);
    if (!lastSelection) continue;
    const lastSelectionAt = Date.parse(lastSelection.created_at);
    const idle = t - lastSelectionAt;

    if (idle >= 7 * DAY) {
      if (sentSinceLastSelection(uid, "d7_dormant", lastSelectionAt)) continue;
      targets.push({ userId: uid, type: "d7_dormant" });
    } else if (idle >= 3 * DAY) {
      if (sentSinceLastSelection(uid, "d3_no_record", lastSelectionAt)) continue;
      targets.push({
        userId: uid,
        type: "d3_no_record",
        collectionId: newestCollection?.id,
      });
    }
  }

  return targets;
}

/** user_id -> that user's device tokens. Users with no token simply drop out. */
export async function tokensByUser(userIds: number[]): Promise<Map<number, string[]>> {
  const byUser = new Map<number, string[]>();
  const wanted = new Set(userIds);

  const rows = await fetchAll<{ user_id: number; fcm_token: string }>((from, to) =>
    getSupabase()
      .from("fcm_tokens")
      .select("user_id, fcm_token")
      .order("id", { ascending: true })
      .range(from, to)
  );

  for (const r of rows) {
    if (!wanted.has(r.user_id)) continue;
    const list = byUser.get(r.user_id);
    if (list) list.push(r.fcm_token);
    else byUser.set(r.user_id, [r.fcm_token]);
  }

  return byUser;
}

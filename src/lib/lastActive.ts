import { getSupabase } from "./supabase";
import { kstDateKey, kstDayStart } from "./kst";

// Written at most once per user per Korean day, not once per request: every
// authenticated call passes through here, and D7 only needs day granularity.
// The in-process set skips the round trip entirely; the `or` guard keeps the
// write correct when another instance already touched the row today.
let cachedDay = "";
const touchedToday = new Set<number>();

export function touchLastActive(userId: number): void {
  const today = kstDateKey();
  if (today !== cachedDay) {
    cachedDay = today;
    touchedToday.clear();
  }
  if (touchedToday.has(userId)) return;
  touchedToday.add(userId);

  void (async () => {
    try {
      const { error } = await getSupabase()
        .from("userinfo")
        .update({ last_active_at: new Date().toISOString() })
        .eq("user_id", userId)
        .or(
          `last_active_at.is.null,last_active_at.lt.${kstDayStart(today).toISOString()}`
        );

      if (error) {
        // Drop the marker so the next request this day retries.
        touchedToday.delete(userId);
        console.error("touchLastActive error:", error);
      }
    } catch (err) {
      touchedToday.delete(userId);
      console.error("touchLastActive error:", err);
    }
  })();
}

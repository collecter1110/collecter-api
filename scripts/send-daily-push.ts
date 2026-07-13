/**
 * Daily retention push (D1 / D3 / D7).
 *
 * Runs as a Railway cron service: `npm run push:daily`, schedule `0 12 * * *`
 * (12:00 UTC = 21:00 KST — Railway cron is UTC, and getting that wrong sends
 * push in the middle of the night).
 *
 * Dry run, sends nothing:  npm run push:daily -- --dry-run
 */
import { getSupabase } from "../src/lib/supabase";
import { kstDateKey } from "../src/lib/kst";
import { resolveTargets, tokensByUser } from "../src/lib/pushTargets";
import { sendToTokens, deleteDeadTokens, type PushType } from "../src/lib/fcm";

const COPY: Record<PushType, { title: string; body: string }> = {
  onboarding_no_collection: {
    title: "첫 컬렉션을 만들어볼까요?",
    body: "좋아하는 것들을 첫 컬렉션으로 모아볼까요? ✨",
  },
  onboarding_no_selection: {
    title: "컬렉션이 비어 있어요",
    body: "만든 컬렉션에 첫 번째 셀렉션을 담아볼까요?",
  },
  d3_no_record: {
    title: "컬렉션이 기다리고 있어요",
    body: "최근 만든 컬렉션에 하나 더 담아볼까요? ✨",
  },
  d7_dormant: {
    title: "오랜만이에요",
    body: "지난번에 모은 취향을 다시 볼 시간이에요.",
  },
};

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const dryRun = process.argv.includes("--dry-run");
/** Test-only: ignore every targeting rule and push this user. */
const forceUser = flag("--force-user");
const forceType = (flag("--force-type") ?? "d3_no_record") as PushType;
const forceCollection = flag("--force-collection");

async function main() {
  const now = new Date();
  const today = kstDateKey(now);
  const db = getSupabase();

  console.log(`[push] ${today} (KST) ${dryRun ? "— DRY RUN" : ""}`);

  let targets;
  if (forceUser) {
    if (!COPY[forceType]) {
      throw new Error(`unknown type: ${forceType} (${Object.keys(COPY).join(" | ")})`);
    }
    targets = [
      {
        userId: Number(forceUser),
        type: forceType,
        collectionId: forceCollection ? Number(forceCollection) : undefined,
      },
    ];
    console.log(`[push] FORCE MODE — user=${forceUser} type=${forceType} (조건 검사 건너뜀)`);
  } else {
    targets = await resolveTargets(now);
  }

  if (targets.length === 0) {
    console.log("[push] 대상자 없음");
    return;
  }

  const tokens = await tokensByUser(targets.map((t) => t.userId));

  const counts: Record<string, number> = {};
  for (const t of targets) counts[t.type] = (counts[t.type] ?? 0) + 1;
  console.log(`[push] 대상자 ${targets.length}명`, counts);

  if (dryRun) {
    for (const t of targets) {
      console.log(
        `  user=${t.userId} type=${t.type}` +
          (t.collectionId ? ` collection=${t.collectionId}` : "") +
          ` tokens=${tokens.get(t.userId)?.length ?? 0}`
      );
    }
    return;
  }

  const dead: string[] = [];
  let sent = 0;
  let skipped = 0;

  for (const target of targets) {
    const userTokens = tokens.get(target.userId) ?? [];
    if (userTokens.length === 0) continue;

    // Log first. The unique index on (user_id, sent_on) is what actually caps a
    // user at one push per day, and claiming the slot before sending means a
    // concurrent or re-run job loses the race instead of double-sending. A send
    // that then fails costs that user today's push — far cheaper than spamming.
    //
    // Force mode skips the log so the same test can be re-run all day.
    if (!forceUser) {
      const { error: logError } = await db.from("push_logs").insert({
        user_id: target.userId,
        type: target.type,
        sent_on: today,
      });

      if (logError) {
        // 23505 = unique violation: someone already claimed this user today.
        if ((logError as { code?: string }).code === "23505") skipped += 1;
        else console.error(`[push] log insert failed user=${target.userId}`, logError);
        continue;
      }
    }

    const copy = COPY[target.type];
    const result = await sendToTokens(userTokens, {
      ...copy,
      type: target.type,
      collectionId: target.collectionId,
    });

    if (result.sent > 0) sent += 1;
    dead.push(...result.deadTokens);
  }

  await deleteDeadTokens(dead);

  console.log(
    `[push] 발송 ${sent}명 / 중복차단 ${skipped}명 / 무효토큰 삭제 ${dead.length}건`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[push] failed:", err);
    process.exit(1);
  });

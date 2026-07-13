import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getSupabase } from "./supabase";

export type PushType =
  | "onboarding_no_collection"
  | "onboarding_no_selection"
  | "d3_no_record"
  | "d7_dormant";

export interface PushMessage {
  title: string;
  body: string;
  type: PushType;
  /**
   * The collection to deep-link into. Set for the two types whose copy points at
   * a collection the user made; without it the client can only open the archive tab.
   */
  collectionId?: number;
}

let app: App | null = null;

function getApp(): App {
  if (app) return app;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");

  let parsed: { project_id: string; client_email: string; private_key: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        // Env vars can't hold real newlines, so the key usually arrives with
        // literal \n sequences.
        privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
      }),
    });

  return app;
}

// FCM drops a token for good on these; anything else (network blip, quota) is
// transient and the row must survive.
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export interface SendResult {
  sent: number;
  failed: number;
  deadTokens: string[];
}

/**
 * Sends one message to every token. Both `notification` and `data` are set —
 * iOS needs `notification` to raise a banner from the background, and the
 * client needs `data` to route the tap.
 */
export async function sendToTokens(
  tokens: string[],
  message: PushMessage
): Promise<SendResult> {
  if (tokens.length === 0) return { sent: 0, failed: 0, deadTokens: [] };

  // FCM data values must all be strings.
  const data: Record<string, string> = { type: message.type };
  if (message.collectionId !== undefined) {
    data.collection_id = String(message.collectionId);
  }

  const messaging = getMessaging(getApp());
  const result: SendResult = { sent: 0, failed: 0, deadTokens: [] };

  // sendEach caps at 500 per call.
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEach(
      batch.map((token) => ({
        token,
        notification: { title: message.title, body: message.body },
        data,
        apns: {
          payload: { aps: { sound: "default" } },
        },
      }))
    );

    res.responses.forEach((r, idx) => {
      if (r.success) {
        result.sent += 1;
        return;
      }
      result.failed += 1;
      const code = r.error?.code ?? "";
      if (DEAD_TOKEN_CODES.has(code)) {
        result.deadTokens.push(batch[idx]);
      } else {
        console.error("push send error:", code, r.error?.message);
      }
    });
  }

  return result;
}

/** Drops tokens FCM has told us are permanently invalid. */
export async function deleteDeadTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;

  const { error } = await getSupabase()
    .from("fcm_tokens")
    .delete()
    .in("fcm_token", tokens);

  if (error) console.error("deleteDeadTokens error:", error);
}

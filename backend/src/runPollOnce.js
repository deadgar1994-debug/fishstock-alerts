import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

import { parseDwrFishStockingHtml } from "./dwrParser.js";
import { insertNewEvents, listSubscriptions } from "./db.js";
import {
  matchesSubscription,
  formatNotification,
  sendExpoPushMessages,
} from "./notify.js";

const POLL_URL = process.env.POLL_URL;
const UA = process.env.POLL_USER_AGENT || "FishStockAlerts/0.1";

/**
 * Runs one poll cycle:
 * - fetch DWR HTML
 * - parse events
 * - insert new events (dedup by id)
 * - notify matching subscriptions
 *
 * Returns a summary object.
 */
export async function runPollOnce() {
  if (!POLL_URL) throw new Error("Missing POLL_URL in env");

  const res = await fetch(POLL_URL, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

  const html = await res.text();
  const events = parseDwrFishStockingHtml(html);

  const { insertedCount, newOnes } = insertNewEvents(events);

  const subs = listSubscriptions();
  const messages = [];

  // Only notify on NEW inserts (production behavior)
  for (const ev of newOnes) {
    for (const sub of subs) {
      if (!sub.expo_push_token) continue;
      if (!matchesSubscription(ev, sub)) continue;

      const n = formatNotification(ev);
      messages.push({
        to: sub.expo_push_token,
        sound: "default",
        title: n.title,
        body: n.body,
        data: n.data,
      });
    }
  }

  // Dedup by token+eventId
  const dedup = new Map();
  for (const m of messages) dedup.set(`${m.to}|${m.data?.eventId}`, m);
  const finalMsgs = Array.from(dedup.values());

  let pushed = 0;
  let expoResponse = null;

  if (finalMsgs.length) {
    const result = await sendExpoPushMessages(finalMsgs);
    pushed = result.sent;
    expoResponse = result.response ?? null;
  }

  return {
    parsed: events.length,
    inserted: insertedCount,
    subscriptions: subs.length,
    matchedMessages: finalMsgs.length,
    pushed,
    expoResponse, // useful for debugging (safe to omit later)
  };
}

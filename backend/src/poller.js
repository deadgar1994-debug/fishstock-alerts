import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

import { parseDwrFishStockingHtml } from "./dwrParser.js";
import { insertNewEvents, listSubscriptions } from "./db.js";
import { matchesSubscription, formatNotification, sendExpoPushMessages } from "./notify.js";

const POLL_URL = process.env.POLL_URL;
const UA = process.env.POLL_USER_AGENT || "FishStockAlerts/0.1";

async function main() {
  if (!POLL_URL) throw new Error("Missing POLL_URL in env");

  const res = await fetch(POLL_URL, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });

  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();

  const events = parseDwrFishStockingHtml(html);
  const { insertedCount, newOnes } = insertNewEvents(events);

  console.log(`[poller] parsed=${events.length} inserted=${insertedCount}`);

  const subs = listSubscriptions();
  if (!subs.length) {
    console.log("[poller] no subscriptions yet");
    return;
  }

  // If nothing new inserted, simulate checks on newest parsed rows (for testing)
  const eventsToCheck = insertedCount > 0 ? newOnes : events.slice(0, 10);
  if (insertedCount <= 0) {
    console.log("[poller] no new inserts; simulating match check on latest parsed rows...");
  }

  const messages = [];
  for (const ev of eventsToCheck) {
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

  // Dedup by (token,eventId)
  const dedup = new Map();
  for (const m of messages) dedup.set(`${m.to}|${m.data?.eventId}`, m);
  const finalMsgs = Array.from(dedup.values());

  if (!finalMsgs.length) {
    console.log("[poller] no matches for current subscriptions");
    return;
  }

  // If we're still using the TESTTOKEN, don't actually call Expo — just log what would be sent
  const hasTestToken = finalMsgs.some((m) => String(m.to).includes("TESTTOKEN"));
  if (hasTestToken) {
    console.log("[poller] TEST MODE: would send these notifications:");
    for (const m of finalMsgs) {
      console.log(`- to=${m.to} | ${m.title} | ${m.body}`);
    }
    return;
  }

  const result = await sendExpoPushMessages(finalMsgs);
  console.log(`[poller] pushed=${result.sent}`);
}

main().catch((e) => {
  console.error("[poller] error", e);
  process.exit(1);
});


import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config();

import { parseDwrFishStockingHtml } from "./dwrParser.js";
import { upsertSubscription, listSubscriptions } from "./db.js";
import { sendExpoPushMessages } from "./notify.js";
import { runPollOnce } from "./runPollOnce.js";

const app = express();
app.use(cors());
app.use(express.json());

/* ---------------- helpers ---------------- */
async function fetchLiveEvents() {
  const pollUrl = process.env.POLL_URL;
  if (!pollUrl) throw new Error("Missing POLL_URL in env");

  const ua = process.env.POLL_USER_AGENT || "FishStockAlerts/0.1";
  const r = await fetch(pollUrl, { headers: { "User-Agent": ua, Accept: "text/html" } });
  if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);

  const html = await r.text();
  return parseDwrFishStockingHtml(html);
}

/* ---------------- health ---------------- */
app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.get("/version", (_, res) => {
  res.json({ ok: true, version: "v-meta-1" });
});

/* ---------------- subscribe ---------------- */
app.post("/subscribe", (req, res) => {
  const { expo_push_token, counties, species, waters } = req.body || {};

  if (!expo_push_token || typeof expo_push_token !== "string") {
    return res.status(400).json({ ok: false, error: "expo_push_token required" });
  }

  upsertSubscription({
    expo_push_token,
    counties: Array.isArray(counties) ? counties : [],
    species: Array.isArray(species) ? species : [],
    waters: Array.isArray(waters) ? waters : [],
  });

  res.json({ ok: true });
});

/* ---------------- run poller (cron / github actions) ---------------- */
app.post("/run-poller", async (req, res) => {
  try {
    const key = String(req.query.key || "");
    if (!process.env.CRON_KEY || key !== process.env.CRON_KEY) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    const result = await runPollOnce();
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------- recent events (LIVE PARSE) ---------------- */
app.get("/events/recent", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);
    const events = (await fetchLiveEvents())
      .sort((a, b) => String(b.date_stocked).localeCompare(String(a.date_stocked)))
      .slice(0, limit);

    res.json({ ok: true, events });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------- meta (dropdown lists) ---------------- */
app.get("/meta/counties", async (_req, res) => {
  try {
    const events = await fetchLiveEvents();
    const counties = Array.from(
      new Set(events.map((e) => String(e.county || "").trim()).filter(Boolean))
    ).sort();
    res.json({ ok: true, counties });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/meta/species", async (_req, res) => {
  try {
    const events = await fetchLiveEvents();
    const species = Array.from(
      new Set(events.map((e) => String(e.species || "").trim()).filter(Boolean))
    ).sort();
    res.json({ ok: true, species });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------- TEST PUSH ---------------- */
app.post("/test-push", async (_req, res) => {
  try {
    const subs = listSubscriptions();

    const messages = subs
      .filter(
        (s) => s.expo_push_token && !String(s.expo_push_token).includes("TESTTOKEN")
      )
      .map((s) => ({
        to: s.expo_push_token,
        sound: "default",
        title: "Test Push ✅",
        body: "If you see this, notifications are working.",
        data: { kind: "test" },
      }));

    if (!messages.length) {
      return res.json({ ok: false, error: "No real Expo push tokens found." });
    }

    const result = await sendExpoPushMessages(messages);
    res.json({ ok: true, sent: result.sent });
  } catch (e) {
    console.error("test-push error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------- start server ---------------- */
const port = parseInt(process.env.PORT || "8787", 10);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));

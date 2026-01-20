import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import {
  upsertSubscription,
  getRecentEvents,
  listSubscriptions,
} from "./db.js";

import { sendExpoPushMessages } from "./notify.js";
import { runPollOnce } from "./runPollOnce.js";

const app = express();
app.use(cors());
app.use(express.json());

/* ---------------- health ---------------- */
app.get("/health", (_, res) => {
  res.json({ ok: true });
});

/* ---------------- subscribe ---------------- */
app.post("/subscribe", (req, res) => {
  const { expo_push_token, counties, species, waters } = req.body || {};

  if (!expo_push_token || typeof expo_push_token !== "string") {
    return res.status(400).json({
      ok: false,
      error: "expo_push_token required",
    });
  }

  upsertSubscription({
    expo_push_token,
    counties: Array.isArray(counties) ? counties : [],
    species: Array.isArray(species) ? species : [],
    waters: Array.isArray(waters) ? waters : [],
  });

  res.json({ ok: true });
});

/* ---------------- run poller (protected) ---------------- */
app.post("/run-poller", async (req, res) => {
  try {
    const key = String(req.query.key || "");
    const expected = String(process.env.CRON_KEY || "");

    if (!expected || key !== expected) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const result = await runPollOnce();
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------- recent events ---------------- */
app.get("/events/recent", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);
  const events = getRecentEvents(limit);
  res.json({ ok: true, events });
});

/* ---------------- TEST PUSH ---------------- */
app.post("/test-push", async (req, res) => {
  try {
    const subs = listSubscriptions();

    const messages = subs
      .filter(
        (s) =>
          s.expo_push_token &&
          !String(s.expo_push_token).includes("TESTTOKEN")
      )
      .map((s) => ({
        to: s.expo_push_token,
        sound: "default",
        title: "Test Push ✅",
        body: "If you see this, notifications are working.",
        data: { kind: "test" },
      }));

    if (!messages.length) {
      return res.json({
        ok: false,
        error: "No real Expo push tokens found.",
      });
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
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

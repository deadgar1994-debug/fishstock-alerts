import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config();

import { parseDwrFishStockingHtml } from "./dwrParser.js";
import { fetchColoradoEvents } from "./coParser.js";

import { upsertSubscription, listSubscriptions } from "./db.js";
import { sendExpoPushMessages } from "./notify.js";
import { runPollOnce } from "./runPollOnce.js";

const app = express();
app.use(cors());
app.use(express.json());

function normState(s) {
  return String(s || "").trim().toUpperCase() || "UT";
}

/* ---------------- UT helper ---------------- */
async function fetchUtahEvents(year) {
  const base = process.env.POLL_URL_UT || process.env.POLL_URL; // fallback
  if (!base) throw new Error("Missing POLL_URL_UT (or POLL_URL) in env");

  const ua = process.env.POLL_USER_AGENT || "FishStockAlerts/0.1";

  const url = new URL(base);
  if (year) url.searchParams.set("y", String(year));

  const r = await fetch(url.toString(), {
    headers: { "User-Agent": ua, Accept: "text/html" },
  });
  if (!r.ok) throw new Error(`UT fetch failed: ${r.status}`);

  const html = await r.text();
  return parseDwrFishStockingHtml(html);
}

/* ---------------- unified "get events" ---------------- */
async function getEventsForState(state, year) {
  const st = normState(state);
  if (st === "CO") return await fetchColoradoEvents();
  // default UT
  return await fetchUtahEvents(year);
}

/* ---------------- health ---------------- */
app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/version", (_, res) => {
  res.json({ ok: true, version: "v-meta-3" });
});

/* ---------------- subscribe (still UT schema for now) ---------------- */
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

/* ---------------- run poller (cron) ---------------- */
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

/* ---------------- recent events ---------------- */
app.get("/events/recent", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);
    const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
    const state = normState(req.query.state);

    const events = (await getEventsForState(state, year))
      .sort((a, b) => String(b.date_stocked).localeCompare(String(a.date_stocked)))
      .slice(0, limit);

    res.json({ ok: true, events });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------- events search + pagination ---------------- */
app.get("/events", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
    const state = normState(req.query.state);

    const county = String(req.query.county || "").trim().toUpperCase();
    const species = String(req.query.species || "").trim().toUpperCase();
    const water = String(req.query.water || "").trim().toUpperCase();

    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);

    const events = await getEventsForState(state, year);

    const filtered = events.filter((e) => {
      const eCounty = String(e.county || "").trim().toUpperCase();
      const eSpecies = String(e.species || "").trim().toUpperCase();
      const eWater = String(e.water_name || "").trim().toUpperCase();

      const cOk = !county || eCounty === county;
      const sOk = !species || eSpecies === species;
      const wOk = !water || eWater.includes(water);

      return cOk && sOk && wOk;
    });

    filtered.sort((a, b) => String(b.date_stocked).localeCompare(String(a.date_stocked)));

    const page = filtered.slice(offset, offset + limit);

    res.json({
      ok: true,
      total: filtered.length,
      limit,
      offset,
      events: page,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------- meta ---------------- */
app.get("/meta/counties", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
    const state = normState(req.query.state);

    const events = await getEventsForState(state, year);
    const counties = Array.from(
      new Set(events.map((e) => String(e.county || "").trim()).filter(Boolean))
    ).sort();

    res.json({ ok: true, counties });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/meta/species", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
    const state = normState(req.query.state);

    const events = await getEventsForState(state, year);
    const species = Array.from(
      new Set(events.map((e) => String(e.species || "").trim()).filter(Boolean))
    ).sort();

    res.json({ ok: true, species });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/meta/waters", async (req, res) => {
  try {
    const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
    const state = normState(req.query.state);
    const county = String(req.query.county || "").trim().toUpperCase();

    const events = await getEventsForState(state, year);

    let waters = events
      .filter((e) => {
        if (!county) return true;
        return String(e.county || "").trim().toUpperCase() === county;
      })
      .map((e) => String(e.water_name || "").trim())
      .filter(Boolean);

    waters = Array.from(new Set(waters)).sort();

    res.json({ ok: true, waters });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------- TEST PUSH ---------------- */
app.post("/test-push", async (_req, res) => {
  try {
    const subs = listSubscriptions();

    const messages = subs
      .filter((s) => s.expo_push_token && !String(s.expo_push_token).includes("TESTTOKEN"))
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
